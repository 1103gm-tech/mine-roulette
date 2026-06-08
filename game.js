const socket = io();
let myTurn = false;
let myId = null;
let lensActive = false;

socket.on('connect', () => { myId = socket.id; });

// 1. 홈 화면 버튼 이벤트 연결
document.getElementById('btn-ai').addEventListener('click', () => {
    alert("🤖 AI 대전 모드는 현재 싱글 플레이 테스트용으로 준비 중입니다! 플레이어 대전을 이용해 주세요.");
});

document.getElementById('btn-pvp').addEventListener('click', () => {
    const roomCode = document.getElementById('room-input').value.trim();
    if (!roomCode) return alert("방 코드를 입력해주세요!");
    
    // 서버에 방 입장 요청 전송
    socket.emit('joinRoom', { roomCode: roomCode });
});

// 서버가 방 입장을 승인하면 홈 화면 숨기고 게임 화면 보여주기
socket.on('roomJoined', (data) => {
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('current-room-id').innerText = data.roomCode;
});

// 2. 실시간 게임 상태 수신 데이터 처리
socket.on('gameState', (data) => {
    myTurn = data.currentTurn === myId;
    
    if (data.players.length < 2) {
        document.getElementById('status').innerText = "상대방을 기다리는 중...";
        return;
    }

    document.getElementById('status').innerText = myTurn ? "🔴 당신의 턴" : "💤 상대방 턴";
    document.getElementById('status').style.color = myTurn ? "#ff3333" : "#ffffff";

    const opponentId = data.players.find(id => id !== myId);
    document.getElementById('my-hearts').innerText = "❤️".repeat(data.lives[myId] || 0);
    document.getElementById('opp-hearts').innerText = "❤️".repeat(data.lives[opponentId] || 0);

    renderBoard(data.board);
});

function renderBoard(boardData) {
    const board = document.getElementById('board');
    board.innerHTML = '';

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
                    socket.emit('lensCheck', { index: index });
                } else {
                    socket.emit('clickCell', { index: index });
                }
            });
        }
        board.appendChild(cellEl);
    });
}

// 카드 뽑기 및 인벤토리 관리
document.getElementById('draw-btn').addEventListener('click', () => {
    if (!myTurn) return alert("당신의 턴이 아닙니다!");
    socket.emit('drawItem');
});

socket.on('yourNewItem', (myItems) => {
    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById(`slot-${i}`);
        if (myItems[i]) {
            slot.innerText = myItems[i].name;
            slot.classList.add('active');
            const itemId = myItems[i].id;
            const slotIdx = i;
            slot.onclick = () => {
                if (!myTurn) return alert("내 턴에만 카드를 쓸 수 있습니다!");
                socket.emit('useItem', { itemId: itemId, slotIndex: slotIdx });
            };
        } else {
            slot.innerText = "비어있음";
            slot.classList.remove('active');
            slot.onclick = null;
        }
    }
});

socket.on('activateLens', () => {
    lensActive = true;
    alert("🔍 돋보기 활성화! 정체를 볼 칸(?)을 선택하세요.");
});

socket.on('lensResult', (data) => { alert(data.message); });
socket.on('itemUsed', (data) => { document.getElementById('log-box').innerText = data.message; });

socket.on('explosion', (data) => {
    alert(data.loser === myId ? "💥 지뢰가 터졌습니다! 목숨이 차감됩니다." : "🎉 상대방이 지뢰를 밟았습니다!");
});

socket.on('gameOver', (data) => {
    alert(data.winner === myId ? "🏆 최종 승리!" : "💀 최종 패배...");
    location.reload();
});