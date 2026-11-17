# UNO FLIP Worldwide — multiplayer starter

A browser-based, server-authoritative 2–7 player multiplayer card game. It uses Socket.IO rooms so friends can play together from different countries and networks. No PeerJS or peer-to-peer signalling is used.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder run:
   ```bash
   npm install
   npm start
   ```
3. Open `http://localhost:3000`.
4. To test from other devices on the same Wi-Fi, open `http://YOUR-LAN-IP:3000`.

## Publish it for worldwide play (Render)

1. Create a GitHub repository and upload the contents of this folder.
2. Sign in to [Render](https://render.com/), choose **New → Blueprint**, and connect the repository.
3. Render reads `render.yaml` and creates the Node web service. Keep the service public.
4. When deployment completes, open the `https://....onrender.com` URL. Share that URL and the six-character room code with friends.
5. For production use, choose an always-on paid instance or another persistent Node host. Render's free instances may sleep after inactivity, so the first connection after idle time can take a while. The game uses WebSockets and needs a host that supports long-lived WebSocket connections.

## Gameplay

- 112 double-sided cards; seven cards per player; start on Light Side.
- Light colours: blue, green, red, yellow. Dark colours: pink, teal, orange, purple.
- Light actions: Draw One, Reverse, Skip, Flip, Wild, Wild Draw Two.
- Dark actions: Draw Five, Reverse, Skip Everyone, Flip, Wild, Wild Draw Color.
- FLIP changes the active face of every card, including hands, draw pile and discard pile.
- UNO button, catch-UNO action, round scoring and 500-point target.
- Server checks turns, legal matches, room capacity and card actions.

## Notes / limitations in this first build

- The visual card faces are original UI representations using the official card names, colour families and game mechanics; this project does not include or reproduce Mattel's proprietary card artwork, logos or branded assets.
- Wild Draw Two / Wild Draw Color legality is checked on the server. The challenge interaction from the printed rules is not yet implemented in this initial build.
- The first release supports room creation, room codes, invite links and reconnecting a player to their seat after a temporary disconnect while the room remains in memory. Rooms are held in server memory; a server restart clears active games.
- The game is designed for 2–7 players as requested, even though the physical game supports a wider player count.

## Reference

Card composition, action-card behaviour, UNO declaration and scoring are based on the official Mattel UNO FLIP instruction sheet: https://service.mattel.com/instruction-sheets/files/GDR44%20UNO%20Flip%5BEnglish_French_German_Spanish_Portuguese%5D%5B5LG%5D.pdf

UNO FLIP is a trademark of Mattel. This is an independent fan-made browser implementation and is not affiliated with or endorsed by Mattel.
