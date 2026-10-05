# Table Wars: Online Update

Your game has been brought into this project. The request is large, so it is split into phases. Each phase ships as a working game you can try.

## Phase 1 - Loading screen + accounts
- Loading screen with the spinning green table. Drag and throw it; it bounces off the screen edges. Continue appears once everything has loaded.
- Home menu login panel: Create account / Log in / Play as Guest.
  - Username: 3-20 characters, unique. Password: 3-20 characters, with at least 1 uppercase letter, 1 lowercase letter and 1 number.
  - Optional email, used only for password reset.
- Signed-in players get their last training menu options and their settings saved and restored on any device. Guests appear as "Guest" online.
- Offline modes (Tutorial, Training, Campaign) stay private and local.

## Phase 2 - Play side menu + 1v1
- Play opens a side menu: Offline Campaign, 1v1, Lobby (with a code box underneath), Party.
- 1v1 queue pairs two players and then shows a 10-second vote for Night / Day / Evening. If both pick the same one, it is used; if not, one of the two picks is chosen at random. Each player is then given red or blue at random.
- 1v1 rules: bombs do 10, bullets 5, slam 10 plus a stun. Player hitboxes are 1.5x bigger. First to 3 round wins takes the match. A score bar at the top shows both names.
- Win/Lose screen buttons:
  - Requeue
  - Rematch: sends an invite the other player answers yes or no; 3-second cooldown on sending. If yes, both go to a new private match.
  - Return to Home
- Online pause (Esc) only offers Return to Home and Settings (without the time-of-day option). The game keeps running. Offline pause still freezes the game.

## Phase 3 - Lobby + Party
- Lobby: a training-mode sandbox with a 6-letter code at the top, for up to 8 players. The code is deleted when the host leaves. Entering a wrong or expired code shows a red "Invalid code" message. The lobby menu adds an invite-by-username search.
- Party: invite players by exact username (not guests), up to 4 in a party. Accept/decline invite pop-ups. A party menu lets the leader kick members or disband the party.
- Party play: Campaign, Training, Lobby, or a direct 1v1 with no queue. After a party 1v1, the win screen shows for 2 seconds, then everyone goes home, with no buttons.

## Technical details
- Lovable Cloud for accounts (synthetic email from the username when no email is given, plus a profiles table with a unique username), saved settings stored as JSON, and lobby codes, parties, invites and the matchmaking queue as tables.
- Realtime channels carry the live game. As you chose, the host player's browser runs the match and sends out its state about 20 times per second. Guests send their inputs and positions, which the host checks.
- A small multiplayer layer is added beside World.tsx: remote players are drawn as tables and a damage-rules switch applies the 1v1 numbers. Offline code paths stay as they are.
- Known limits: if the host's connection drops, the match ends, and a player could cheat from the host seat. Password reset only works for accounts with an email.
