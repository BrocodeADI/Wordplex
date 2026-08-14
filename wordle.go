package main

import "strings"

var wordSet map[string]struct{}

func initDictionary() {
	wordSet = make(map[string]struct{}, len(wordList))
	for _, w := range wordList {
		w = strings.ToUpper(strings.TrimSpace(w))
		if len(w) != 5 {
			continue
		}
		wordSet[w] = struct{}{}
	}
}

func isValidWord(word string) bool {
	if len(word) != 5 {
		return false
	}
	// Temporarily bypass validation
	return true
}

func evaluateGuess(secret string, guess string) []string {
	secret = strings.ToUpper(secret)
	guess = strings.ToUpper(guess)

	result := make([]string, 5)
	remaining := make(map[byte]int, 5)
	secretBytes := []byte(secret)
	guessBytes := []byte(guess)

	for i := 0; i < 5; i++ {
		if guessBytes[i] == secretBytes[i] {
			result[i] = "correct"
		} else {
			remaining[secretBytes[i]] = remaining[secretBytes[i]] + 1
		}
	}

	for i := 0; i < 5; i++ {
		if result[i] == "correct" {
			continue
		}
		b := guessBytes[i]
		if remaining[b] > 0 {
			result[i] = "present"
			remaining[b] = remaining[b] - 1
			continue
		}
		result[i] = "absent"
	}

	return result
}

