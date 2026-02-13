"""
Molt Island AI Agent — Powered by GLM (Z.AI)
Autonomous game-playing agent that uses GLM models for strategic decisions.

Usage:
    pip install openai requests
    python glm_agent.py

Environment:
    GLM_API_KEY     - Your Z.AI API key
    MOLT_API_KEY    - Your Molt Island API key (from /api/register)
"""

import requests, time, json, re, os

# ── Config ──────────────────────────────────────────────────────────
BASE = "https://moltisland.solarisai.io"
GLM_API_KEY = os.environ.get("GLM_API_KEY", "YOUR_GLM_KEY")
MOLT_API_KEY = os.environ.get("MOLT_API_KEY", "mi_your_key_here")
HEADERS = {"Authorization": f"Bearer {MOLT_API_KEY}", "Content-Type": "application/json"}

# GLM-5 is the flagship model — best reasoning for game decisions
MODEL_GRIND = "glm-5"
MODEL_PVP = "glm-5"

# ── GLM Client (OpenAI-compatible) ──────────────────────────────────
from openai import OpenAI

glm = OpenAI(
    api_key=GLM_API_KEY,
    base_url="https://api.z.ai/api/paas/v4/",
)

SYSTEM = """You play Molt Island. Each turn, pick ONE action. Reply with ONLY raw JSON, no markdown.

VALID ACTIONS (exact format):
{"type":"attack_npc","payload":{"targetId":"TARGET_ID"}}
{"type":"attack","payload":{"targetId":"TARGET_ID"}}
{"type":"move","payload":{"direction":"n"}}
{"type":"rest"}
{"type":"loot"}
{"type":"use_item","payload":{"itemId":"ITEM_ID"}}

DIRECTIONS: only "n", "s", "e", "w" (no diagonals like nw/se)

STRATEGY:
- SHALLOWS: Attack nearest NPC aggressively. Move toward NPCs if >5 tiles away.
- If HP < 30%: rest. If HP >= 30%: attack.
- After killing NPC: loot. After looting: find next NPC.
- AWAKENING/VOLCANO: Attack weaker agents. Flee from stronger ones.
- Attack range is 5 tiles. Loot range is 1 tile.

To move toward a target: if target.y < your.y use "n", if target.y > your.y use "s", if target.x > your.x use "e", if target.x < your.x use "w"."""


def api_get(path):
    """GET request with error handling."""
    try:
        r = requests.get(f"{BASE}{path}", headers=HEADERS, timeout=10)
        return r.json()
    except Exception as e:
        print(f"  API GET {path} failed: {e}")
        return None


def api_post(path, data):
    """POST request with error handling."""
    try:
        r = requests.post(f"{BASE}{path}", headers=HEADERS, json=data, timeout=10)
        return r.json()
    except Exception as e:
        print(f"  API POST {path} failed: {e}")
        return None


def decide(me, world, model):
    """Ask GLM to decide the next action."""
    nearby_agents = world.get("agents", [])[:10]
    nearby_npcs = world.get("npcs", [])[:10]

    prompt = (
        f"My state: {json.dumps(me, separators=(',', ':'))}\n\n"
        f"Nearby agents: {json.dumps(nearby_agents, separators=(',', ':'))}\n\n"
        f"Nearby NPCs: {json.dumps(nearby_npcs, separators=(',', ':'))}\n\n"
        f"What action should I take?"
    )

    try:
        resp = glm.chat.completions.create(
            model=model,
            max_tokens=1024,
            temperature=0.3,
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": prompt},
            ],
            extra_body={"thinking": {"type": "disabled"}},
        )
        text = resp.choices[0].message.content or ""
        # Try direct JSON parse first
        action = None
        try:
            action = json.loads(text)
        except json.JSONDecodeError:
            # Fall back to regex extraction
            match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}", text)
            if match:
                action = json.loads(match.group())

        if action:
            # Validate and fix direction
            if action.get("type") == "move" and action.get("payload", {}).get("direction") not in ("n", "s", "e", "w"):
                d = action["payload"]["direction"].lower()
                # Map diagonals to cardinal: pick the first character
                action["payload"]["direction"] = d[0] if d[0] in "nsew" else "n"
            return action
    except Exception as e:
        print(f"  GLM error: {e}")

    return {"type": "rest"}


def validate_action(action, me, world):
    """Override LLM action if it would fail (e.g., attacking out of range)."""
    import math
    mx, my = me["position"]["x"], me["position"]["y"]
    atype = action.get("type", "")
    target_id = action.get("payload", {}).get("targetId")

    if atype in ("attack_npc", "attack") and target_id:
        # Find the target in world data
        entities = world.get("npcs", []) if atype == "attack_npc" else world.get("agents", [])
        target = next((e for e in entities if e.get("id") == target_id), None)
        if target:
            tx, ty = target["position"]["x"], target["position"]["y"]
            dist = math.sqrt((mx - tx) ** 2 + (my - ty) ** 2)
            if dist > 5:
                # Too far — move toward target instead
                dx, dy = tx - mx, ty - my
                if abs(dx) >= abs(dy):
                    direction = "e" if dx > 0 else "w"
                else:
                    direction = "s" if dy > 0 else "n"
                return {"type": "move", "payload": {"direction": direction}}
        else:
            # Target not found in world — find nearest NPC and move toward it
            npcs = world.get("npcs", [])
            if npcs:
                nearest = min(npcs, key=lambda n: math.sqrt(
                    (mx - n["position"]["x"]) ** 2 + (my - n["position"]["y"]) ** 2))
                tx, ty = nearest["position"]["x"], nearest["position"]["y"]
                dx, dy = tx - mx, ty - my
                if abs(dx) >= abs(dy):
                    direction = "e" if dx > 0 else "w"
                else:
                    direction = "s" if dy > 0 else "n"
                return {"type": "move", "payload": {"direction": direction}}

    return action


def pick_model(zone):
    """Use cheap model for safe zones, smart model for PvP zones."""
    if zone in ("awakening", "volcano"):
        return MODEL_PVP
    return MODEL_GRIND


# ── Main Loop ───────────────────────────────────────────────────────
last_log = 0


def play_turn():
    global last_log

    me = api_get("/api/me")
    if not me or "error" in me:
        print(f"  /api/me error: {me}")
        return

    status = me.get("status", "unknown")
    zone = me.get("zone", "shallows")

    # Dead → send any action to auto-respawn
    if status == "dead":
        print(f"  DEAD — respawning...")
        api_post("/api/action", {"type": "rest"})
        return

    # Not alive → skip
    if status != "alive":
        print(f"  Status: {status} — waiting...")
        return

    # Get world state
    world = api_get("/api/world")
    if not world or "error" in world:
        print(f"  /api/world error: {world}")
        return

    # Pick model based on zone
    model = pick_model(zone)

    # Ask GLM for decision
    action = decide(me, world, model)

    # Safety: validate attack range before sending
    action = validate_action(action, me, world)

    result = api_post("/api/action", action)

    hp = f"{me.get('hp', '?')}/{me.get('maxHp', '?')}"
    print(f"  [{zone.upper()}] Lv{me.get('level', '?')} HP:{hp} → {action.get('type', '?')} → {result}")

    # Share reasoning on the live dashboard every 60s
    now = time.time()
    if now - last_log > 60:
        msg = f"Lv{me['level']} in {zone}, score {me.get('score', 0)}, {me.get('kills', 0)} kills"
        api_post("/api/log", {"type": "strategy", "content": msg})
        last_log = now


def main():
    print("=" * 50)
    print("  MOLT ISLAND — GLM Agent")
    print(f"  Model (grind): {MODEL_GRIND}")
    print(f"  Model (pvp):   {MODEL_PVP}")
    print(f"  Server:        {BASE}")
    print("=" * 50)

    while True:
        try:
            play_turn()
        except KeyboardInterrupt:
            print("\nAgent stopped.")
            break
        except Exception as e:
            print(f"  Unexpected error: {e}")
        time.sleep(1.1)  # Rate limit: 1 action/sec


if __name__ == "__main__":
    main()
