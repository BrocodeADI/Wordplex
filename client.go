package main

import (
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	server *Server
	room   *Room
	conn   *websocket.Conn
	send   chan []byte

	id     string
	name   string
	isHost bool
}

func (c *Client) readPump() {
	defer func() {
		if c.room != nil {
			c.room.removeClient(c)
		}
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Println("Invalid message format:", err)
			continue
		}

		msgType, ok := msg["type"].(string)
		if !ok {
			continue
		}

		switch msgType {
		case "join_room":
			playerName, _ := msg["playerName"].(string)
			roomCode, _ := msg["roomCode"].(string)
			createRoom, _ := msg["create"].(bool)

			totalRounds := 10
			timePerRound := 90
			if v, ok := msg["totalRounds"].(float64); ok {
				if int(v) > 0 {
					totalRounds = int(v)
				}
			}
			if v, ok := msg["timePerRound"].(float64); ok {
				if int(v) > 0 {
					timePerRound = int(v)
				}
			}

			playerName = strings.TrimSpace(playerName)
			if playerName == "" {
				playerName = "Player"
			}

			if createRoom {
				if roomCode == "" {
					roomCode = generateRoomCode()
				}
				roomCode = strings.ToUpper(roomCode)

				room := NewRoom(roomCode, totalRounds, timePerRound, c.server)
				c.server.mu.Lock()
				exists := false
				if _, ok := c.server.rooms[roomCode]; ok {
					exists = true
				}
				if !exists {
					c.server.rooms[roomCode] = room
				}
				c.server.mu.Unlock()
				if exists {
					c.sendJSON(map[string]interface{}{"type": "error", "message": "Room code already exists"})
					continue
				}

				c.name = playerName
				c.isHost = true
				c.id = generateRoomCode()
				room.addClient(c)
				room.setHost(c)
				go room.run()

				c.sendJSON(map[string]interface{}{
					"type":     "room_joined",
					"roomCode": roomCode,
					"isHost":   true,
					"state":    room.snapshotState(),
				})
				continue
			}

			roomCode = strings.ToUpper(strings.TrimSpace(roomCode))
			if roomCode == "" {
				c.sendJSON(map[string]interface{}{"type": "error", "message": "Room code required"})
				continue
			}

			c.server.mu.Lock()
			room, exists := c.server.rooms[roomCode]
			c.server.mu.Unlock()
			if !exists {
				c.sendJSON(map[string]interface{}{"type": "error", "message": "Room not found"})
				continue
			}

			c.name = playerName
			c.isHost = false
			c.id = generateRoomCode()
			room.addClient(c)

			c.sendJSON(map[string]interface{}{
				"type":     "room_joined",
				"roomCode": roomCode,
				"isHost":   false,
				"state":    room.snapshotState(),
			})

		case "chat_message":
			text, _ := msg["text"].(string)
			text = strings.TrimSpace(text)
			if text == "" {
				continue
			}
			if c.room == nil {
				continue
			}
			c.room.broadcastJSON(map[string]interface{}{
				"type":      "chat_message",
				"playerName": c.name,
				"text":      text,
				"ts":        time.Now().UnixMilli(),
			})

		case "round_start":
			if c.room != nil && c.isHost {
				c.room.startGameOrNextRound()
			}
		case "start_game":
			if c.room != nil && c.isHost {
				c.room.startGameOrNextRound()
			}
		case "next_round":
			if c.room != nil && c.isHost {
				c.room.startGameOrNextRound()
			}
		case "submit_guess":
			guess, _ := msg["guess"].(string)
			guess = strings.ToUpper(strings.TrimSpace(guess))
			if c.room == nil {
				continue
			}
			c.room.handleSubmitGuess(c, guess)
		}
	}
}

func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.WriteMessage(websocket.TextMessage, message)
		}
	}
}

func (c *Client) sendJSON(v interface{}) {
	b, err := json.Marshal(v)
	if err == nil {
		c.send <- b
	}
}
