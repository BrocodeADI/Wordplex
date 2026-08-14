package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for simplicity
	},
}

type Server struct {
	rooms map[string]*Room
	mu    sync.Mutex
}

func NewServer() *Server {
	return &Server{
		rooms: make(map[string]*Room),
	}
}

func main() {
	rand.Seed(time.Now().UnixNano())
	initDictionary()
	server := NewServer()

	// Serve static files from the "public" directory
	fs := http.FileServer(http.Dir("./public"))
	http.Handle("/", fs)

	http.HandleFunc("/ws", server.handleWebSocket)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Printf("Server starting on http://localhost:%s\n", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	client := &Client{
		conn:   conn,
		server: s,
		send:   make(chan []byte, 256),
	}

	go client.writePump()
	go client.readPump()
}

func generateRoomCode() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

// Simple list of 5-letter words
var wordList = []string{
	"APPLE", "BERRY", "CHAIR", "DANCE", "EAGLE", "FLAME", "GRAPE", "HOUSE", "IMAGE", "JUICE",
	"KNIFE", "LEMON", "MOUSE", "NIGHT", "OCEAN", "PIZZA", "QUEEN", "RIVER", "SNAKE", "TRAIN",
	"UNCLE", "VOICE", "WATER", "XENON", "YACHT", "ZEBRA", "BRAIN", "CLOUD", "DREAM", "EARTH",
	"FROST", "GHOST", "HEART", "IGLOO", "JOKER", "KITE",  "LIGHT", "MAGIC", "NINJA", "ONION",
	"PLANT", "QUICK", "ROBOT", "SUGAR", "TIGER", "UMBRA", "VIRUS", "WHALE", "XYLAN", "YOUTH",
	"ZESTY", "ALOFT", "BLEND", "CRISP", "DRIVE", "EMPTY", "FLOCK", "GLINT", "HOVER", "INERT",
	"JUMP",  "KNEEL", "LUNCH", "MOUNT", "NOBLE", "OASIS", "PROUD", "QUOTA", "REACT", "SHINE",
	"TRUST", "USUAL", "VIVID", "WRECK", "YIELD", "ZONE",
}

func getRandomWord() string {
	return wordList[rand.Intn(len(wordList))]
}
