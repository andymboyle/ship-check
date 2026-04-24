package main

import (
	"net/http"
)

func handleRequest() {
	// Empty error handling — HIGH
	resp, err := http.Get("https://api.example.com")
	if err != nil {
	}

	// Bare return without logging — MEDIUM
	data, err := fetchData()
	if err != nil {
		return
	}

	// Using http.Get (DefaultClient, no timeout) — MEDIUM
	resp2, _ := http.Get("https://api.example.com/data")

	// http.Client without Timeout — HIGH
	client := &http.Client{}
}

func goodHandling() {
	// Proper error handling — should NOT be flagged
	resp, err := http.Get("https://api.example.com")
	if err != nil {
		log.Printf("request failed: %v", err)
		return
	}

	// Client with timeout — should NOT be flagged
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
}
