let ws;
let playerName = '';
let roomCode = '';
let state = null;

const WORD_LENGTH = 5;
const GUESSES = 6;

let currentRow = 0;
let currentTile = 0;
let boardState = Array.from({ length: GUESSES }, () => Array(WORD_LENGTH).fill(''));
let roundOver = true;
let inputLocked = false;

const windows = {
	lobby: document.getElementById('lobby-window'),
	game: document.getElementById('game-window'),
	status: document.getElementById('status-window'),
	chat: document.getElementById('chat-window')
};

function switchTab(tab) {
	document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
	document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

	if (tab === 'join') {
		document.querySelectorAll('.tab')[0].classList.add('active');
		document.getElementById('join-tab').classList.add('active');
		return;
	}

	document.querySelectorAll('.tab')[1].classList.add('active');
	document.getElementById('create-tab').classList.add('active');
}

function showScreen(screenName) {
	if (screenName === 'lobby') {
		document.getElementById('lobby-window').classList.remove('hidden');
		document.getElementById('lobby-screen').classList.remove('hidden');
		document.getElementById('waiting-screen').classList.add('hidden');
		windows.game.classList.add('hidden');
		windows.status.classList.add('hidden');
		windows.chat.classList.add('hidden');
		document.querySelectorAll('.dock-item').forEach(d => {
			if(d.dataset.target === 'lobby-window') d.classList.remove('hidden');
			else d.classList.add('hidden');
		});
	} else if (screenName === 'waiting') {
		document.getElementById('lobby-window').classList.remove('hidden');
		document.getElementById('lobby-screen').classList.add('hidden');
		document.getElementById('waiting-screen').classList.remove('hidden');
	} else if (screenName === 'game') {
		document.getElementById('lobby-window').classList.add('hidden');
		windows.game.classList.remove('hidden', 'minimized');
		windows.status.classList.remove('hidden', 'minimized');
		windows.chat.classList.remove('hidden', 'minimized');
		document.querySelectorAll('.dock-item').forEach(d => {
			if(d.dataset.target === 'lobby-window') d.classList.add('hidden');
			else d.classList.remove('hidden');
		});
	}
}

function connectWebSocket(onOpen) {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

	ws.onopen = () => {
		if (onOpen) onOpen();
	};

	ws.onmessage = (event) => {
		const msg = JSON.parse(event.data);
		handleMessage(msg);
	};

	ws.onclose = () => {
		alert('Connection lost. Please refresh.');
	};
}

function createRoom() {
	playerName = document.getElementById('player-name').value.trim() || 'Player';
	const totalRounds = parseInt(document.getElementById('total-rounds').value) || 10;
	const timePerRound = parseInt(document.getElementById('time-per-round').value) || 90;

	connectWebSocket(() => {
		ws.send(JSON.stringify({
			type: 'join_room',
			create: true,
			playerName,
			totalRounds,
			timePerRound
		}));
	});
}

function joinRoom() {
	playerName = document.getElementById('player-name').value.trim() || 'Player';
	roomCode = document.getElementById('room-code').value.trim().toUpperCase();
	if (!roomCode) return alert('Enter a room code');

	connectWebSocket(() => {
		ws.send(JSON.stringify({
			type: 'join_room',
			create: false,
			playerName,
			roomCode
		}));
	});
}

function startGame() {
	if (!ws) return;
	ws.send(JSON.stringify({ type: 'start_game' }));
}

function startRound() {
	if (!ws) return;
	ws.send(JSON.stringify({ type: 'round_start' }));
}

function nextRound() {
	document.getElementById('modal-overlay').classList.add('hidden');
	if (!ws) return;
	ws.send(JSON.stringify({ type: 'next_round' }));
}

function sendChat() {
	if (!ws) return;
	const input = document.getElementById('chat-text');
	const text = input.value.trim();
	if (!text) return;
	ws.send(JSON.stringify({ type: 'chat_message', text }));
	input.value = '';
}

function handleMessage(msg) {
	switch (msg.type) {
		case 'error':
			alert(msg.message);
			break;
		case 'room_joined':
			roomCode = msg.roomCode;
			state = msg.state;
			document.getElementById('display-room-code').textContent = roomCode;
			document.getElementById('top-room-code').textContent = roomCode;
			updateFromState(state);
			showScreen('waiting');
			break;
		case 'state_update':
			state = msg.state;
			updateFromState(state);
			break;
		case 'round_start':
			roundOver = false;
			inputLocked = false;
			document.getElementById('modal-overlay').classList.add('hidden');
			document.getElementById('top-room-code').textContent = msg.roomCode;
			document.getElementById('round-tracker').textContent = `Round ${msg.round}/${msg.totalRounds}`;
			document.getElementById('timer').textContent = msg.timeLeft;
			initBoard();
			resetKeyboard();
			showScreen('game');
			break;
		case 'timer_tick':
			document.getElementById('timer').textContent = msg.timeLeft;
			break;
		case 'guess_result':
			handleGuessResult(msg);
			break;
		case 'round_end':
			handleRoundEnd(msg);
			break;
		case 'chat_message':
			appendChat(msg.playerName, msg.text);
			break;
		case 'game_over':
			document.getElementById('modal-overlay').classList.add('hidden');
			alert('Game Over!');
			showScreen('lobby');
			break;
	}
}

function updateFromState(next) {
	if (!next) return;
	const hostName = next.host || '';
	const amHost = hostName && hostName === playerName;

	const waitingHostControls = document.getElementById('host-controls');
	if (waitingHostControls) {
		waitingHostControls.classList.toggle('hidden', !amHost);
	}

	const hostControlsGame = document.getElementById('host-controls-game');
	if (hostControlsGame) {
		hostControlsGame.classList.toggle('hidden', !amHost);
	}

	updateWaitingPlayers(next.players || []);
	updateStatusPanel(next.players || []);

	if (next.playing) {
		document.getElementById('round-tracker').textContent = `Round ${next.currentRound}/${next.totalRounds}`;
		document.getElementById('timer').textContent = next.timeLeft;
		document.getElementById('top-room-code').textContent = next.roomCode;
		showScreen('game');
		return;
	}
}

function updateWaitingPlayers(players) {
	const list = document.getElementById('players-list');
	if (!list) return;
	list.innerHTML = '';
	players.forEach(p => {
		const li = document.createElement('li');
		li.textContent = p.name;
		list.appendChild(li);
	});
}

function updateStatusPanel(players) {
	const list = document.getElementById('players-status-list');
	if (!list) return;
	list.innerHTML = '';
	players.forEach(p => {
		const li = document.createElement('li');
		li.className = 'status-item';

		const name = document.createElement('div');
		name.className = 'status-name';
		name.textContent = p.name;

		const meta = document.createElement('div');
		meta.className = 'status-meta';

		const frac = document.createElement('div');
		frac.textContent = `${p.guessCount}/6`;

		const icon = document.createElement('div');
		if (p.status === 'solved') icon.textContent = '✅';
		else if (p.status === 'dead') icon.textContent = '💀';
		else icon.textContent = '';

		meta.appendChild(frac);
		meta.appendChild(icon);

		li.appendChild(name);
		li.appendChild(meta);
		list.appendChild(li);
	});
}

function appendChat(name, text) {
	const container = document.getElementById('chat-messages');
	if (!container) return;
	const line = document.createElement('div');
	line.className = 'chat-line';
	const n = document.createElement('span');
	n.className = 'chat-name';
	n.textContent = name;
	const t = document.createElement('span');
	t.textContent = text;
	line.appendChild(n);
	line.appendChild(t);
	container.appendChild(line);
	container.scrollTop = container.scrollHeight;
}

function initBoard() {
	currentRow = 0;
	currentTile = 0;
	boardState = Array.from({ length: GUESSES }, () => Array(WORD_LENGTH).fill(''));

	const board = document.getElementById('board');
	board.innerHTML = '';

	for (let i = 0; i < GUESSES; i++) {
		const row = document.createElement('div');
		row.className = 'board-row';
		row.dataset.row = String(i);
		for (let j = 0; j < WORD_LENGTH; j++) {
			const tile = document.createElement('div');
			tile.className = 'tile';
			tile.dataset.state = 'tbd';
			tile.id = `tile-${i}-${j}`;
			row.appendChild(tile);
		}
		board.appendChild(row);
	}
}

function resetKeyboard() {
	document.querySelectorAll('.key').forEach(key => {
		key.dataset.state = '';
	});
}

function handleKeyInput(key) {
	if (roundOver || inputLocked) return;
	if (document.getElementById('game-window').classList.contains('hidden') || document.getElementById('game-window').classList.contains('minimized')) return;

	if (key === 'ENTER') {
		submitGuess();
		return;
	}
	if (key === 'BACKSPACE' || key === '⌫') {
		deleteLetter();
		return;
	}
	if (/^[A-Z]$/.test(key)) {
		addLetter(key);
	}
}

function addLetter(letter) {
	if (currentTile >= WORD_LENGTH || currentRow >= GUESSES) return;
	const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
	tile.textContent = letter;
	tile.dataset.state = 'active';
	boardState[currentRow][currentTile] = letter;
	currentTile++;
}

function deleteLetter() {
	if (currentTile <= 0) return;
	currentTile--;
	const tile = document.getElementById(`tile-${currentRow}-${currentTile}`);
	tile.textContent = '';
	tile.dataset.state = 'tbd';
	boardState[currentRow][currentTile] = '';
}

function submitGuess() {
	if (currentTile !== WORD_LENGTH) return;
	if (!ws) return;
	const guess = boardState[currentRow].join('');
	inputLocked = true;
	ws.send(JSON.stringify({ type: 'submit_guess', guess }));
}

function handleGuessResult(msg) {
	if (!msg.ok) {
		inputLocked = false;
		shakeRow(currentRow);
		return;
	}

	const colors = msg.colors;
	const guess = msg.guess;
	const guessArr = guess.split('');

	animateTiles(currentRow, guessArr, colors, () => {
		currentRow++;
		currentTile = 0;
		inputLocked = false;
	});
}

function animateTiles(rowIndex, guessArr, colors, callback) {
	let completed = 0;
	for (let i = 0; i < WORD_LENGTH; i++) {
		const tile = document.getElementById(`tile-${rowIndex}-${i}`);
		setTimeout(() => {
			tile.classList.add('flip');
			setTimeout(() => {
				tile.dataset.state = colors[i];
				updateKeyboard(guessArr[i], colors[i]);
				tile.classList.remove('flip');
				completed++;
				if (completed === WORD_LENGTH && callback) callback();
			}, 125);
		}, i * 250);
	}
}

function updateKeyboard(letter, state) {
	const key = Array.from(document.querySelectorAll('.key')).find(k => k.dataset.key === letter);
	if (!key) return;
	const currentState = key.dataset.state;
	if (state === 'correct') {
		key.dataset.state = 'correct';
		return;
	}
	if (state === 'present' && currentState !== 'correct') {
		key.dataset.state = 'present';
		return;
	}
	if (state === 'absent' && currentState !== 'correct' && currentState !== 'present') {
		key.dataset.state = 'absent';
	}
}

function shakeRow(rowIndex) {
	const row = document.querySelector(`.board-row[data-row="${rowIndex}"]`);
	if (!row) return;
	row.classList.remove('shake');
	void row.offsetWidth;
	row.classList.add('shake');
}

function handleRoundEnd(msg) {
	roundOver = true;
	inputLocked = false;
	document.getElementById('modal-overlay').classList.remove('hidden');
	document.getElementById('modal-title').textContent = 'Round Ended';
	document.getElementById('modal-word').textContent = msg.secretWord;
	document.getElementById('modal-winner').textContent = '';

	const hostName = state && state.host ? state.host : '';
	const amHost = hostName && hostName === playerName;
	if (amHost) {
		document.getElementById('modal-host-controls').classList.remove('hidden');
		document.getElementById('modal-waiting-message').classList.add('hidden');
	} else {
		document.getElementById('modal-host-controls').classList.add('hidden');
		document.getElementById('modal-waiting-message').classList.remove('hidden');
	}
}

document.addEventListener('keydown', (e) => {
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
	
	const key = e.key.toUpperCase();
	if (key === 'ENTER' || key === 'BACKSPACE') {
		handleKeyInput(key);
		return;
	}
	if (/^[A-Z]$/.test(key)) {
		handleKeyInput(key);
	}
});

document.querySelectorAll('.key').forEach(key => {
	key.addEventListener('click', () => {
		handleKeyInput(key.dataset.key);
	});
});

document.getElementById('chat-text').addEventListener('keydown', (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();
		sendChat();
	}
});

// Window Management & Dragging
let zIndexCounter = 100;
document.querySelectorAll('.window').forEach(win => {
    win.addEventListener('mousedown', () => {
        win.style.zIndex = ++zIndexCounter;
    });
    
    const titleBar = win.querySelector('.title-bar');
    if (titleBar) {
        let isDragging = false;
        let offsetX, offsetY;

        titleBar.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('light')) return;
            isDragging = true;
            offsetX = e.clientX - win.getBoundingClientRect().left;
            offsetY = e.clientY - win.getBoundingClientRect().top;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            win.style.left = `${e.clientX - offsetX}px`;
            win.style.top = `${e.clientY - offsetY}px`;
            win.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    
    const closeBtn = win.querySelector('.close-btn');
    const minBtn = win.querySelector('.min-btn');
    
    if (closeBtn) closeBtn.addEventListener('click', () => {
        win.classList.add('hidden');
    });
    
    if (minBtn) minBtn.addEventListener('click', () => {
        win.classList.add('minimized');
    });
});

document.querySelectorAll('.dock-item').forEach(item => {
    item.addEventListener('click', () => {
        const targetId = item.dataset.target;
        const targetWin = document.getElementById(targetId);
        if (targetWin) {
            targetWin.classList.remove('hidden', 'minimized');
            targetWin.style.zIndex = ++zIndexCounter;
        }
    });
});

