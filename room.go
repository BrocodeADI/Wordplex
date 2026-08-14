package main

import (
	"sort"
	"sync"
	"time"
)

type PlayerStatus string

const (
	PlayerStatusPlaying PlayerStatus = "playing"
	PlayerStatusSolved  PlayerStatus = "solved"
	PlayerStatusDead    PlayerStatus = "dead"
)

type Player struct {
	Name       string       `json:"name"`
	Score      int          `json:"score"`
	GuessCount int          `json:"guessCount"`
	Status     PlayerStatus `json:"status"`
}

type Room struct {
	code string

	server *Server
	mu     sync.Mutex

	host    *Client
	players map[*Client]*Player

	totalRounds  int
	timePerRound int
	currentRound int

	secretWord string
	playing    bool
	timeLeft   int

	timerTicker *time.Ticker
	timerCancel chan struct{}
}

func NewRoom(code string, totalRounds int, timePerRound int, server *Server) *Room {
	if totalRounds <= 0 {
		totalRounds = 10
	}
	if timePerRound <= 0 {
		timePerRound = 90
	}
	return &Room{
		code:         code,
		server:       server,
		players:      make(map[*Client]*Player),
		totalRounds:  totalRounds,
		timePerRound: timePerRound,
		currentRound: 0,
		playing:      false,
		timeLeft:     timePerRound,
	}
}

func (r *Room) run() {
}

func (r *Room) setHost(c *Client) {
	r.mu.Lock()
	r.host = c
	r.mu.Unlock()
}

func (r *Room) addClient(c *Client) {
	r.mu.Lock()
	r.players[c] = &Player{Name: c.name, Score: 0, GuessCount: 0, Status: PlayerStatusPlaying}
	c.room = r
	if r.host == nil {
		r.host = c
		c.isHost = true
	}
	r.mu.Unlock()

	r.broadcastStateUpdate()
}

func (r *Room) removeClient(c *Client) {
	r.mu.Lock()
	delete(r.players, c)
	roomEmpty := len(r.players) == 0
	hostLeft := r.host == c
	if hostLeft {
		r.host = nil
		for client := range r.players {
			r.host = client
			client.isHost = true
			break
		}
	}
	r.mu.Unlock()

	if roomEmpty {
		r.server.mu.Lock()
		delete(r.server.rooms, r.code)
		r.server.mu.Unlock()
		r.stopTimer()
		return
	}

	r.broadcastStateUpdate()
}

func (r *Room) stopTimer() {
	r.mu.Lock()
	if r.timerCancel != nil {
		close(r.timerCancel)
		r.timerCancel = nil
	}
	if r.timerTicker != nil {
		r.timerTicker.Stop()
		r.timerTicker = nil
	}
	r.mu.Unlock()
}

func (r *Room) snapshotState() map[string]interface{} {
	r.mu.Lock()
	defer r.mu.Unlock()
	return map[string]interface{}{
		"roomCode":     r.code,
		"totalRounds":  r.totalRounds,
		"timePerRound": r.timePerRound,
		"currentRound": r.currentRound,
		"playing":      r.playing,
		"timeLeft":     r.timeLeft,
		"host":         r.hostNameLocked(),
		"players":      r.playerListLocked(),
	}
}

func (r *Room) hostNameLocked() string {
	if r.host == nil {
		return ""
	}
	return r.host.name
}

func (r *Room) playerListLocked() []Player {
	players := make([]Player, 0, len(r.players))
	for _, p := range r.players {
		players = append(players, *p)
	}
	sort.Slice(players, func(i, j int) bool {
		return players[i].Name < players[j].Name
	})
	return players
}

func (r *Room) broadcastJSON(v interface{}) {
	r.mu.Lock()
	clients := make([]*Client, 0, len(r.players))
	for c := range r.players {
		clients = append(clients, c)
	}
	r.mu.Unlock()

	for _, c := range clients {
		c.sendJSON(v)
	}
}

func (r *Room) broadcastStateUpdate() {
	r.broadcastJSON(map[string]interface{}{
		"type":  "state_update",
		"state": r.snapshotState(),
	})
}

func (r *Room) startGameOrNextRound() {
	r.mu.Lock()
	if r.playing {
		r.mu.Unlock()
		return
	}
	if r.currentRound >= r.totalRounds {
		r.mu.Unlock()
		r.broadcastJSON(map[string]interface{}{"type": "game_over"})
		return
	}
	if r.timerTicker != nil {
		r.timerTicker.Stop()
		r.timerTicker = nil
	}
	if r.timerCancel != nil {
		close(r.timerCancel)
		r.timerCancel = nil
	}

	r.currentRound++
	r.secretWord = getRandomWord()
	r.playing = true
	r.timeLeft = r.timePerRound
	for _, p := range r.players {
		p.GuessCount = 0
		p.Status = PlayerStatusPlaying
	}
	r.timerTicker = time.NewTicker(1 * time.Second)
	r.timerCancel = make(chan struct{})

	startPayload := map[string]interface{}{
		"type":        "round_start",
		"roomCode":    r.code,
		"round":       r.currentRound,
		"totalRounds": r.totalRounds,
		"timeLeft":    r.timeLeft,
	}
	r.mu.Unlock()

	r.broadcastJSON(startPayload)
	r.broadcastStateUpdate()

	go r.timerLoop(r.currentRound)
}

func (r *Room) timerLoop(round int) {
	for {
		r.mu.Lock()
		ticker := r.timerTicker
		cancel := r.timerCancel
		playing := r.playing
		currentRound := r.currentRound
		r.mu.Unlock()

		if !playing || currentRound != round || ticker == nil {
			return
		}

		select {
		case <-ticker.C:
		case <-cancel:
			return
		}

		ended := false
		r.mu.Lock()
		if r.playing && r.currentRound == round {
			r.timeLeft--
			if r.timeLeft <= 0 {
				ended = true
			}
		}
		tLeft := r.timeLeft
		r.mu.Unlock()

		r.broadcastJSON(map[string]interface{}{"type": "timer_tick", "timeLeft": tLeft})

		if ended {
			r.endRound("timeout")
			return
		}
	}
}

func (r *Room) handleSubmitGuess(c *Client, guess string) {
	if len(guess) != 5 {
		c.sendJSON(map[string]interface{}{"type": "guess_result", "ok": false, "error": "invalid_length"})
		return
	}
	if !isValidWord(guess) {
		c.sendJSON(map[string]interface{}{"type": "guess_result", "ok": false, "error": "not_in_dictionary"})
		return
	}

	r.mu.Lock()
	if !r.playing {
		r.mu.Unlock()
		c.sendJSON(map[string]interface{}{"type": "guess_result", "ok": false, "error": "round_not_active"})
		return
	}
	player, ok := r.players[c]
	if !ok {
		r.mu.Unlock()
		c.sendJSON(map[string]interface{}{"type": "guess_result", "ok": false, "error": "not_in_room"})
		return
	}
	if player.Status != PlayerStatusPlaying {
		r.mu.Unlock()
		c.sendJSON(map[string]interface{}{"type": "guess_result", "ok": false, "error": "player_not_active"})
		return
	}

	colors := evaluateGuess(r.secretWord, guess)
	player.GuessCount++
	solved := guess == r.secretWord
	if solved {
		player.Status = PlayerStatusSolved
		player.Score++
	} else if player.GuessCount >= 6 {
		player.Status = PlayerStatusDead
	}
	rowIndex := player.GuessCount - 1
	r.mu.Unlock()

	c.sendJSON(map[string]interface{}{
		"type":   "guess_result",
		"ok":     true,
		"guess":  guess,
		"row":    rowIndex,
		"colors": colors,
		"solved": solved,
	})

	r.broadcastStateUpdate()

	if r.shouldEndRoundEarly() {
		r.endRound("all_done")
	}
}

func (r *Room) shouldEndRoundEarly() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.playing {
		return false
	}
	if len(r.players) == 0 {
		return false
	}
	for _, p := range r.players {
		if p.Status == PlayerStatusPlaying {
			return false
		}
	}
	return true
}

func (r *Room) endRound(reason string) {
	r.mu.Lock()
	if !r.playing {
		r.mu.Unlock()
		return
	}
	r.playing = false
	secret := r.secretWord
	roomCode := r.code
	round := r.currentRound
	total := r.totalRounds
	if r.timerCancel != nil {
		close(r.timerCancel)
		r.timerCancel = nil
	}
	if r.timerTicker != nil {
		r.timerTicker.Stop()
		r.timerTicker = nil
	}
	r.mu.Unlock()

	r.broadcastJSON(map[string]interface{}{
		"type":        "round_end",
		"roomCode":    roomCode,
		"round":       round,
		"totalRounds": total,
		"reason":      reason,
		"secretWord":  secret,
	})

	r.broadcastStateUpdate()
}
