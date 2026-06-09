const db = window.fbDB;
const { ref, set, onValue, update, get } = window.fbRefs;

let myId = sessionStorage.getItem('playerId') || 'p_' + Math.random().toString(36).substr(2, 9);
sessionStorage.setItem('playerId', myId);

let currentRoomCode = null;
let isAiMode = false;
let myTurn = false;
let lensActive = false;
let localGameState = null;

function generateInitialBoard() {
    let cells = Array(25).fill(null).map(() => ({ isMine: false, opened: false, count: 0 }));
    let mineCount = 0;
    while (mineCount < 5) {
        let randIndex = Math.floor(Math.random() * 25);
        if (!cells[randIndex].isMine) { cells[randIndex].isMine = true; mineCount++; }
    }
    for (let i = 0; i < 25; i++) {
        if (cells[i].isMine) continue;
        let row = Math.floor(i / 5), col = i % 5, count = 0;
        for (let r = -1; r <= 1; r++) {
            for (let c = -1; c <= 1; c++) {
                let nr = row + r, nc = col + c;
                if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
                    if (cells[nr * 5 + nc].isMine) count++;
                }
            }
        }
        cells[i].count = count;
    }
    return cells;
}

// 싱글 AI 대전 모드 시작
function startAiGame() {
    isAiMode = true;
    currentRoomCode = "AI_MATCH";
    
    localGameState = {
        players: [myId, "AI_BOT"],
        gameState: {
            board: generateInitialBoard(),
            currentTurn: myId,
            lives: { [myId]: 3, "AI_BOT": 3 },
            itemDecks: { [myId]: [], "AI_BOT": [] },
            cuffed: false,
            statusMsg: "악마(AI)와의 계약이 시작되었습니다. 지뢰를 피해 살아남으세요."
        }
    };

    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.add('hidden'); // 로비 숨기기
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('current-room-id').innerText = "SINGLE (AI)";
    
    renderAiUi();
}

function renderAiUi() {
    const state = localGameState.gameState;
    myTurn = state.currentTurn === myId;

    document.getElementById('log-box').innerText = state.statusMsg;
    document.getElementById('status').innerText = myTurn ? "🔴 당신의 턴" : "🤖 악마의 턴...";
    document.getElementById('status').style.color = myTurn ? "#ff3333" : "#3498db";

    document.getElementById('my-hearts').innerText = "❤️".repeat(state.lives[myId] || 0);
    document.getElementById('opp-hearts').innerText = "❤️".repeat(state.lives["AI_BOT"] || 0);

    if (state.lives[myId] <= 0) { alert("💀 패배했습니다..."); location.reload(); return; }
    if (state.lives["AI_BOT"] <= 0) { alert("🏆 승리했습니다!"); location.reload(); return; }

    renderBoard(state.board);
    renderInventory(state.itemDecks[myId] || []);

    if (!myTurn) { setTimeout(triggerAiTurn, 1500); }
}

function triggerAiTurn() {
    let state = localGameState.gameState;
    if (state.currentTurn !== "AI_BOT") return;

    let aiItems = state.itemDecks["AI_BOT"] || [];
    if (aiItems.length > 0 && Math.random() < 0.3) {
        let item = aiItems.shift();
        if (item.id === 'cuffs') { state.cuffed = true; state.statusMsg = "⛓️ AI가 수갑을 채웠습니다! 턴이 묶입니다."; }
        else if (item.id === 'shuffle') { state.board = generateInitialBoard(); state.statusMsg = "🔄 AI가 셔플을 발동했습니다!"; }
        renderAiUi();
        return;
    }

    if (Math.random() < 0.25 && aiItems.length < 5) {
        const itemsPool = [{ id: 'lens', name: '🔍 돋보기' }, { id: 'cuffs', name: '⛓️ 수갑' }, { id: 'shuffle', name: '🔄 셔플' }];
        aiItems.push(itemsPool[Math.floor(Math.random() * itemsPool.length)]);
        state.itemDecks["AI_BOT"] = aiItems;
        if (state.cuffed) { state.cuffed = false; state.currentTurn = myId; }
        else { state.currentTurn = myId; }
    } else {
        let closedIndexes = [];
        state.board.forEach((c, idx) => { if (!c.opened) closedIndexes.push(idx); });
        let randIdx = closedIndexes[Math.floor(Math.random() * closedIndexes.length)];
        let cell = state.board[randIdx];
        cell.opened = true;

        if (cell.isMine) {
            state.lives["AI_BOT"]--;
            if (state.lives["AI_BOT"] > 0) state.board = generateInitialBoard();
        } else {
            if (state.cuffed) { state.cuffed = false; }
            else { state.currentTurn = myId; }
        }
    }
    renderAiUi();
}

// PVP 멀티플레이 매칭 모드
document.getElementById('btn-ai').addEventListener('click', () => { startAiGame(); });

document.getElementById('btn-pvp').addEventListener('click', async () => {
    const roomCode = document.getElementById('room-input').value.trim();
    if (!roomCode) return alert("방 코드를 입력해주세요!");
    currentRoomCode = roomCode;
    isAiMode = false;

    // 1단계: 먼저 대기 로비 화면으로 전환
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
    document.getElementById('lobby-room-id').innerText = currentRoomCode;

    const roomRef = ref(db, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);
    let roomData = snapshot.val();

    if (!roomData) {
        roomData = {
            players: [myId],
            gameState: {
                board: [],
                currentTurn: myId,
                lives: { [myId]: 3 },
                itemDecks: { [myId]: [] },
                cuffed: false,
                statusMsg: "상대방의 접속을 기다리는 중..."
            }
        };
        await set(roomRef, roomData);
    } else {
        if (roomData.players.length >= 2 && !roomData.players.includes(myId)) {
            document.getElementById('home-screen').classList.remove('hidden');
            document.getElementById('lobby-screen').classList.add('hidden');
            return alert("방이 이미 가득 찼습니다.");
        }
        if (!roomData.players.includes(myId)) {
            roomData.players.push(myId);
            roomData.gameState.lives[myId] = 3;
            roomData.gameState.itemDecks[myId] = [];
            roomData.gameState.board = generateInitialBoard();
            roomData.gameState.statusMsg = "두 명의 계약자가 모두 모였습니다. 매치를 시작합니다.";
            await set(roomRef, roomData);
        }
    }

    listenToRoom(roomCode);
});

function listenToRoom(roomCode) {
    onValue(ref(db, `rooms/${roomCode}`), (snapshot) => {
        const room = snapshot.val();
        if (!room || isAiMode) return;

        const state = room.gameState;
        localGameState = room; 
        myTurn = state.currentTurn === myId;

        // 2명이 모여서 지뢰판이 생성되었다면 로비 스크린을 끄고 인게임 스크린을 켬
        if (room.players.length >= 2) {
            document.getElementById('lobby-screen').classList.add('hidden');
            document.getElementById('game-screen').classList.remove('hidden');
            document.getElementById('current-room-id').innerText = currentRoomCode;
        } else {
            // 혼자만 있을 때는 계속 로비 유지
            return;
        }

        document.getElementById('log-box').innerText = state.statusMsg || "";
        document.getElementById('status').innerText = myTurn ? "🔴 당신의 턴" : "💤 상대방 턴";
        document.getElementById('status').style.color = myTurn ? "#ff3333" : "#ffffff";

        const opponentId = room.players.find(id => id !== myId);
        document.getElementById('my-hearts').innerText = "❤️".repeat(state.lives[myId] || 0);
        document.getElementById('opp-hearts').innerText = "❤️".repeat(state.lives[opponentId] || 0);

        if (state.lives[myId] <= 0) { alert("💀 최종 패배..."); location.reload(); return; }
        if (opponentId && state.lives[opponentId] <= 0) { alert("🏆 최종 승리!"); location.reload(); return; }

        renderBoard(state.board);
        renderInventory(state.itemDecks[myId] || []);
    });
}

function renderBoard(boardData) {
    const board = document.getElementById('board');
    board.innerHTML = '';
    if (!boardData || boardData.length === 0) return;

    boardData.forEach((cell, index) => {
        const cellEl = document.createElement('div');
        cellEl.classList.add('cell');

        if (cell.opened) {
            cellEl.classList.add('opened');
            if (cell.isMine) {
                cellEl.classList.add('mine');
                cellEl.innerText = '💥';
            } else {
                cellEl.innerText = cell.count === 0 ? '' : cell.count;
            }
        } else {
            cellEl.innerText = '?';
            cellEl.addEventListener('click', () => {
                if (!myTurn) return alert("당신의 턴이 아닙니다!");
                if (lensActive) {
                    lensActive = false;
                    alert(cell.isMine ? "🔍 돋보기 결과: 💥 지뢰입니다!" : "🔍 돋보기 결과: 🟢 안전합니다.");
                } else {
                    handleCellClick(index);
                }
            });
        }
        board.appendChild(cellEl);
    });
}

function handleCellClick(index) {
    let state = localGameState.gameState;
    let cell = state.board[index];
    cell.opened = true;
    
    const opponentId = localGameState.players.find(id => id !== myId);

    if (cell.isMine) {
        state.lives[myId]--;
        alert("💥 지뢰가 터졌습니다!");
        if(state.lives[myId] > 0) state.board = generateInitialBoard();
        state.statusMsg = "💥 지뢰 폭발! 지뢰 판이 새롭게 재배치됩니다.";
    } else {
        if (state.cuffed) {
            state.cuffed = false;
            state.statusMsg = "⛓️ 수갑이 풀렸습니다. 당신의 턴이 유지됩니다!";
        } else {
            state.currentTurn = opponentId;
            state.statusMsg = "안전지대 탐색 완료. 턴이 상대방에게 넘어갑니다.";
        }
    }
    syncData();
}

document.getElementById('draw-btn').addEventListener('click', () => {
    if (!myTurn) return alert("당신의 턴이 아닙니다!");
    let state = localGameState.gameState;
    let myItems = state.itemDecks[myId] || [];
    if (myItems.length >= 5) return alert("가방이 가득 찼습니다!");

    const itemsPool = [{ id: 'lens', name: '🔍 돋보기' }, { id: 'cuffs', name: '⛓️ 수갑' }, { id: 'shuffle', name: '🔄 셔플' }];
    const newItem = itemsPool[Math.floor(Math.random() * itemsPool.length)];
    myItems.push(newItem);
    state.itemDecks[myId] = myItems;

    const opponentId = localGameState.players.find(id => id !== myId);
    if (state.cuffed) {
        state.cuffed = false;
        state.statusMsg = `🃏 카드를 뽑았습니다. 내 턴 유지.`;
    } else {
        state.currentTurn = opponentId;
        state.statusMsg = `🃏 상대방이 카드를 뽑고 턴을 넘겼습니다.`;
    }
    syncData();
});

function renderInventory(myItems) {
    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById(`slot-${i}`);
        if (myItems[i]) {
            slot.innerHTML = `<span style='font-size:18px;'>${myItems[i].name.split(' ')[0]}</span><br>${myItems[i].name.split(' ')[1]}`;
            slot.classList.add('active');
            slot.onclick = () => useItem(i, myItems[i].id);
        } else {
            slot.innerText = "비어있음";
            slot.classList.remove('active');
            slot.onclick = null;
        }
    }
}

function useItem(slotIdx, itemId) {
    if (!myTurn) return alert("내 턴에만 카드를 쓸 수 있습니다!");
    let state = localGameState.gameState;
    state.itemDecks[myId] = state.itemDecks[myId].filter((_, idx) => idx !== slotIdx);

    if (itemId === 'cuffs') {
        state.cuffed = true;
        state.statusMsg = "⛓️ 수갑 사용! 상대방의 다음 턴이 강제로 스킵됩니다.";
    } else if (itemId === 'shuffle') {
        state.board = generateInitialBoard();
        state.statusMsg = "🔄 셔플 사용! 판 전체가 뒤흔들렸습니다.";
    } else if (itemId === 'lens') {
        lensActive = true;
        alert("🔍 돋보기 활성화. 확인할 슬롯(?)을 클릭하세요.");
        return;
    }
    syncData();
}

function syncData() {
    if (isAiMode) {
        renderAiUi();
    } else {
        set(ref(db, `rooms/${currentRoomCode}/gameState`), localGameState.gameState);
    }
}