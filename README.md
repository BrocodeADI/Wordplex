# Wordplex

**🕹️ Play it live:** [https://wordplex-adi.onrender.com/](https://wordplex-adi.onrender.com/)

A real-time, multiplayer Wordle clone built with a beautiful retro macOS Aqua aesthetic. Create rooms, invite your friends, and race against the clock to guess the secret word!

## ✨ Features

- **Real-Time Multiplayer:** Play synchronously with friends using WebSockets.
- **Customizable Rooms:** Create a room and customize the number of rounds (1-10) and time per round (10-300 seconds).
- **Retro Aesthetic:** Designed to look like an old-school operating system with draggable floating windows and traffic light buttons.
- **Authentic Animations:** Features a recreation of the classic macOS "Genie" (slurpy funnel) effect when minimizing windows to the dock.
- **Live Leaderboard:** See who guesses the word the fastest in the round status window.

## 🛠️ Tech Stack

- **Backend:** Go (`net/http`)
- **Real-time Communication:** WebSockets (`github.com/gorilla/websocket`)
- **Frontend:** Vanilla HTML, CSS (Custom Keyframes & Clip-paths), Vanilla JavaScript
- **Deployment:** Docker-ready multi-stage build

## 🚀 Running Locally

1. Make sure you have [Go](https://golang.org/doc/install) installed.
2. Clone the repository:
   ```bash
   git clone https://github.com/BrocodeADI/Wordplex.git
   cd Wordplex
   ```
3. Run the server:
   ```bash
   go run .
   ```
4. Open your browser and navigate to `http://localhost:8080`.

## 🐳 Deployment

This repository includes a multi-stage `Dockerfile` and is ready to be deployed to container platforms like Render, Fly.io, or Google Cloud Run.

### Deploying to Render (Free)
1. Go to [Render](https://render.com) and create a new **Web Service**.
2. Connect your GitHub repository.
3. Render will automatically detect the `Dockerfile`.
4. Select the **Free** instance type and deploy!

---
*Built with Go and WebSockets.*
