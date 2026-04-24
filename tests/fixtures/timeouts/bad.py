import httpx
import requests
import redis

client = httpx.AsyncClient()

response = requests.get("https://api.example.com/data")

r = redis.Redis(host="localhost", port=6379)
