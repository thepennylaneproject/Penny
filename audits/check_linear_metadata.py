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
if not API_KEY:
    print("ERROR: LINEAR_API_KEY not set in .env.local")
    exit(1)

def gql(query):
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=json.dumps({"query": query}).encode(),
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

print("Fetching Linear metadata (UUIDs)...")

# 1. Teams
print("\n--- Teams ---")
res = gql("{ teams { nodes { id name key } } }")
if res and "data" in res:
    for t in res["data"]["teams"]["nodes"]:
        print(f"Name: {t['name']} | Key: {t['key']} | ID: {t['id']}")

# 2. Labels
print("\n--- Labels ---")
res = gql("{ labels { nodes { id name } } }")
if res and "data" in res:
    for l in res["data"]["labels"]["nodes"]:
        print(f"Name: {l['name']} | ID: {l['id']}")

# 3. Projects
print("\n--- Projects ---")
res = gql("{ projects { nodes { id name } } }")
if res and "data" in res:
    for p in res["data"]["projects"]["nodes"]:
        print(f"Name: {p['name']} | ID: {p['id']}")
