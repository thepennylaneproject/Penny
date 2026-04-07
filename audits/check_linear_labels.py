#!/usr/bin/env python3
import json
import os
import urllib.request
import urllib.error

def load_env():
    env_path = ".env.local"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[len("export "):]
                if "=" in line:
                    key, val = line.split("=", 1)
                    val = val.strip("'\"")
                    if key not in os.environ:
                        os.environ[key] = val

load_env()

API_KEY = os.environ.get("LINEAR_API_KEY")
TEAM_ID = "82da2485-351a-4e0c-8731-4dda92915986"

def gql(query, variables=None):
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": API_KEY,
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"Error: {e.read().decode()}")
        return None

print(f"Fetching labels for Team {TEAM_ID}...")
query = """
    query($teamId: String!) {
        team(id: $teamId) {
            labels { nodes { id name } }
        }
    }
"""
res = gql(query, {"teamId": TEAM_ID})
if res and "data" in res:
    team = res["data"].get("team")
    if team:
        labels = team.get("labels", {}).get("nodes", [])
        for l in labels:
            print(f"Name: {l['name']} | ID: {l['id']}")
    else:
        print("Team not found.")
else:
    print(f"Failed to fetch labels: {res}")
