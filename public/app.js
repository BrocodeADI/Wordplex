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
		genieShow(document.getElementById('lobby-window'));
		document.getElementById('lobby-screen').classList.remove('hidden');
		document.getElementById('waiting-screen').classList.add('hidden');
		genieHide(windows.game);
		genieHide(windows.status);
		genieHide(windows.chat);
		document.querySelectorAll('.dock-item').forEach(d => {
			if(d.dataset.target === 'lobby-window') d.classList.remove('hidden');
			else d.classList.add('hidden');
		});
	} else if (screenName === 'waiting') {
		genieShow(document.getElementById('lobby-window'));
		document.getElementById('lobby-screen').classList.add('hidden');
		document.getElementById('waiting-screen').classList.remove('hidden');
	} else if (screenName === 'game') {
		genieHide(document.getElementById('lobby-window'));
		genieShow(windows.game);
		genieShow(windows.status);
		genieShow(windows.chat);
		document.querySelectorAll('.dock-item').forEach(d => {
			if(d.dataset.target === 'lobby-window') d.classList.add('hidden');
			else d.classList.remove('hidden');
		});
	}
}

// --- Genie animation helpers ---
// These ensure we never use display:none on .window elements, which would
// destroy the rendering context and make clip-path animations impossible.

function genieShow(win) {
	if (!win) return;
	// Already visible and not docked/minimizing — nothing to do.
	if (!win.classList.contains('genie-docked') &&
		!win.classList.contains('genie-minimizing')) return;
	win.style.removeProperty('transform');
	win.classList.remove('genie-docked', 'genie-minimizing');
	setGenieDirection(win, win.id);
	win.classList.add('genie-restoring');
	win.addEventListener('animationend', function handler(e) {
		if (e.animationName !== 'genie-in') return;
		win.classList.remove('genie-restoring');
		win.removeEventListener('animationend', handler);
	});
}

function genieHide(win) {
	if (!win) return;
	// Already docked — nothing to do.
	if (win.classList.contains('genie-docked')) return;
	win.style.removeProperty('transform');
	win.classList.remove('genie-restoring');
	setGenieDirection(win, win.id);
	win.classList.add('genie-minimizing');
	win.addEventListener('animationend', function handler(e) {
		if (e.animationName !== 'genie-out') return;
		win.classList.remove('genie-minimizing');
		win.classList.add('genie-docked');
		win.removeEventListener('animationend', handler);
	});
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
			document.getElementById('host-controls-game').classList.add('hidden'); // explicitly hide the start round button
			document.getElementById('top-room-code').textContent = msg.roomCode;
			document.getElementById('round-tracker').textContent = `Round ${msg.round}/${msg.totalRounds}`;
			document.getElementById('timer').textContent = msg.timeLeft;
			initBoard();
			resetKeyboard();
			showScreen('game');
			// Bug 2 contributor: if focus was left inside the chat box (or any
			// other input) from a prior action, the global keydown guard below
			// would silently swallow every letter/ENTER press meant for the
			// board. Force focus back to neutral ground when a round starts.
			if (document.activeElement && document.activeElement !== document.body) {
				document.activeElement.blur();
			}
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

	// Bug 3 fix: this button is "start the NEXT round" — it must only ever be
	// visible for the host, and only ever between rounds. Previously this only
	// checked `amHost`, so every state_update while a round was in progress
	// (guesses, timer, player list changes...) re-showed it mid-round.
	const hostControlsGame = document.getElementById('host-controls-game');
	if (hostControlsGame) {
		hostControlsGame.classList.toggle('hidden', !(amHost && !next.playing));
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
	const gw = document.getElementById('game-window');
	if (gw.classList.contains('genie-docked') || gw.classList.contains('genie-minimizing') || gw.classList.contains('hidden')) return;

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
	console.log("Sending guess:", guess);
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
	// Bug 2 contributor: this used to bail out for *any* focused input/textarea
	// anywhere on the page. That's too broad — it silently ate every keystroke
	// (including ENTER) whenever, e.g., the chat box still had focus, making
	// the board look completely unresponsive. Scope it to text-entry fields
	// only; the on-screen keyboard buttons are <button> elements and are
	// unaffected either way.
	const tag = e.target.tagName;
	const isTextEntry = (tag === 'INPUT' || tag === 'TEXTAREA') && e.target.type !== 'button';
	if (isTextEntry) return;

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
            // Do NOT set inline transform here — it kills @keyframes animations
            // because inline styles have higher specificity than class-based rules.
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    
    const closeBtn = win.querySelector('.close-btn');
    const minBtn = win.querySelector('.min-btn');

    if (closeBtn) closeBtn.addEventListener('click', () => {
        genieHide(win);
    });

    if (minBtn) minBtn.addEventListener('click', () => {
        genieHide(win);
    });
});

function setGenieDirection(win, targetId) {
    // Bias the clip-path funnel horizontally toward whichever dock icon this
    // window will actually minimize/restore from, so the "slurp" reads as
    // heading toward the dock instead of straight down the middle.
    const dockItem = document.querySelector(`.dock-item[data-target="${targetId}"]`);
    if (!dockItem) {
        win.style.removeProperty('--genie-dx');
        return;
    }
    const winRect = win.getBoundingClientRect();
    const dockRect = dockItem.getBoundingClientRect();
    const winCenterX = winRect.left + winRect.width / 2;
    const dockCenterX = dockRect.left + dockRect.width / 2;
    win.style.setProperty('--genie-dx', `${dockCenterX - winCenterX}px`);
}

document.querySelectorAll('.dock-item').forEach(item => {
    item.addEventListener('click', () => {
        const targetId = item.dataset.target;
        const targetWin = document.getElementById(targetId);
        if (!targetWin) return;
        targetWin.style.zIndex = ++zIndexCounter;

        // Toggle: if window is docked or mid-minimize, restore it.
        // If it's already visible, minimize it back into the dock.
        const isDocked = targetWin.classList.contains('genie-docked') ||
                         targetWin.classList.contains('genie-minimizing');
        if (isDocked) {
            genieShow(targetWin);
        } else {
            genieHide(targetWin);
        }
    });
});
