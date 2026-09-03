# Live Game

Live Game is a collaborative football-analysis platform for recording a match, reviewing the live feed without interrupting the recording, tagging tactical moments and sharing the resulting analysis with the staff.

This is the complete client user guide. The interface is in English, so button and menu names are written exactly as they appear in the application.

## Contents

1. [Recommended equipment](#recommended-equipment)
2. [Accounts and team access](#accounts-and-team-access)
3. [Management access](#management-access)
4. [Prepare the application](#prepare-the-application)
5. [Create and manage a match](#create-and-manage-a-match)
6. [Record a match live](#record-a-match-live)
7. [Use live replay](#use-live-replay)
8. [Tag and edit moments](#tag-and-edit-moments)
9. [Mark the match periods](#mark-the-match-periods)
10. [Save and upload the complete recording](#save-and-upload-the-complete-recording)
11. [Identify submoments](#identify-submoments)
12. [Use Playlists](#use-playlists)
13. [Use Reports](#use-reports)
14. [Use Maps](#use-maps)
15. [Settings and shared media](#settings-and-shared-media)
16. [Backups and data safety](#backups-and-data-safety)
17. [Match-day checklist](#match-day-checklist)
18. [Troubleshooting](#troubleshooting)

## Recommended equipment

For the camera computer:

- A Windows or macOS computer with the latest Google Chrome or Microsoft Edge.
- A camera or capture card recognised as a webcam.
- A stable internet connection, preferably wired Ethernet.
- Enough free disk space for the complete local recording.
- The production Live Game HTTPS address. Camera access may not work over insecure HTTP.

For staff devices:

- A recent version of Chrome, Edge or Safari.
- A stable Wi-Fi or wired connection.
- A separate Live Game account for each staff member.

Keep the camera computer connected to power. Its Live Game tab must remain open until **End live** has finished finalising the recording.

## Accounts and team access

### Create the first account and team

1. Open Live Game and select **Create account**.
2. Enter your name, username and password.
3. Use a username with 3–40 letters, numbers, dots, hyphens or underscores.
4. Use a password with at least 10 characters, including uppercase, lowercase and a number.
5. After registration, choose **Create team**.
6. Enter the team name and select **Create workspace**.

The person who creates the workspace prepares the team configuration and invites the remaining staff.

### Invite another staff member

1. Open **Settings**.
2. In **Team access**, choose **Analyst** or **Administrator**.
3. Select **Create invitation**.
4. Copy the invitation code and send it privately to the intended staff member.

An invitation expires after 24 hours and can only be used once.

### Join an existing team

1. Create your own Live Game account.
2. On the first setup screen, select **Join team**.
3. Paste the invitation code supplied by the team administrator.
4. Select **Join workspace**.

Do not create a second team when you intend to access an existing workspace. Matches, recordings and moments are only shared between accounts in the same workspace.

### Concurrent access

Live Game detects when other staff members are using the workspace. The warning is informational: select **Continue anyway** when everyone is intentionally working on the same match.

Each person controls their own replay position. One person rewinding, pausing or selecting a moment does not move another person's video.

## Management access

Sensitive areas are protected by a separate management password:

- **Matches**
- **New match**
- **Maintenance**
- **Settings**
- Match and moment editing

Staff may access operational areas such as **Maps**, **Reports**, **Playlists** and **Help** without unlocking management access.

To change the management password:

1. Open **Settings**.
2. Find **Security** → **Management password**.
3. Enter the current password and the new password twice.
4. Select **Change password**.

Changing it locks management access in other open sessions. Use at least eight characters with at least one letter and one number.

## Prepare the application

Complete this configuration before creating the first match.

### Create seasons

1. Open **Maintenance**.
2. Select **Seasons**.
3. Enter the season name and optional start and end dates.
4. Select **Add**.

### Create clubs or teams

1. In **Maintenance**, select **Clubs / teams**.
2. Enter the full name and an optional short name.
3. Select **Add**.

Create every possible opponent needed for the competition.

### Create competitions

1. In **Maintenance**, select **Competitions**.
2. Enter the competition name.
3. Choose its season.
4. Select all participating clubs.
5. Select **Add**.

Create the season and clubs before creating the competition.

### Configure moments and submoments

Open **Settings** to define the analysis model.

A **main moment** is an event tagged during the match, such as Offensive Organisation, Defensive Transition or Set Pieces. Configure:

- **Name**: the label shown to the analyst.
- **Code**: a short internal identifier.
- **Color**: used on buttons, lists and timelines.
- **Key**: the keyboard shortcut used during tagging.
- **Available submoments**: detailed actions that may later be recorded inside this moment.

A **submoment action** is identified during review. Configure its name, code, colour and shortcut, then choose whether it requires a pitch location, goal location, both or neither.

Avoid assigning the same shortcut to two actions. The **Shortcuts** panel provides a quick overview of all configured keys.

## Create and manage a match

1. Open **New match**.
2. Select the **Season**, **Competition** and **Opponent**.
3. Optionally enter the round, date, venue and notes.
4. Select **Create match**.

Only clubs assigned to the selected competition are available as opponents.

From **Matches**, you can search by title, opponent or competition; select **Open Live Game**; use the pencil to edit a match; or use the bin to delete it and all associated moments.

Deleting a match is permanent. Download a backup first when its data may be required later.

## Record a match live

Only the camera computer starts and ends the recording.

### Connect the camera

1. Open the match and select the camera button, labelled **Connect camera**.
2. Allow browser access to the camera and microphone.
3. If more than one camera is available, select the correct device.
4. Confirm that the live image is visible.

If using a capture card, select it as the camera source. Test audio and video before kick-off.

### Start recording

1. Select **Start live**.
2. Choose the local folder where the complete recording will be saved.
3. Approve write access to that folder.
4. Wait for confirmation that recording has started.

Live Game creates a `.webm` file named after the match and timestamp. At the same time, it creates short cloud replay segments so staff can rewind during the live event.

When Cloudflare Stream is configured, **Start live** also publishes the same camera and audio through WebRTC. Staff accounts that open the same match automatically receive the live image. They do not need a camera connected to their own devices.

The first replay segment normally becomes available after approximately five seconds. Recording continues when a user rewinds, pauses, reviews a clip or returns to live.

### Resume an existing live session

If the camera page is interrupted but the session remains active, the operator who started it can reconnect the camera and select **Resume recording**. Other users see **Live running** and cannot take control of that camera recording.

### End recording

1. Return to the camera computer.
2. Select **End live**.
3. Wait while **Finalizing…** is displayed.
4. Confirm that Live Game reports the local file as saved.

Do not close the browser, disconnect the camera or remove the storage drive during finalisation.

## Use live replay

Drag the live timeline to any recorded position while recording continues.

| Control | Action |
| --- | --- |
| Back 15 seconds | Moves 15 seconds backwards |
| Back 5 seconds | Moves 5 seconds backwards |
| Play / Pause | Starts or pauses replay |
| Forward 5 seconds | Moves 5 seconds forwards |
| Forward 15 seconds | Moves 15 seconds forwards |
| `1×`, `2×`, `4×` | Changes replay speed |
| **Go Live** | Returns to the newest live image |
| Bin button | Deletes the most recently created moment |
| **Second** + **Go** | Jumps to an exact recording time |

Keyboard controls work when the cursor is not inside an input field:

- `Left Arrow`: back five seconds.
- `Right Arrow`: forward five seconds.
- `Space`: play or pause.
- Configured moment shortcut: tag that moment type.

The **LIVE** badge means you are watching the live edge. **REPLAY** shows how far behind live you are. The viewer counter shows staff currently connected to that session.

At the live edge, remote staff watch the low-latency WebRTC transmission. Moving backwards switches that user to the R2 replay segments; **Go Live** reconnects that user to WebRTC. This switch does not affect the camera operator or other viewers.

## Tag and edit moments

### Tag a moment

Select a main-moment button at the top of the Live Game workspace, or press its configured shortcut.

Live Game stores the previous 20 seconds ending at the current playhead:

- At the live edge, it ends at the current live time.
- During replay, it ends at the selected replay position.
- Near the beginning, its start is automatically limited to `00:00`.

The recording is never cut or interrupted. A moment is a saved time range pointing to the original video.

### Review and classify a moment

Select a row under **Tagged moments** or select its bar in the bottom timeline. Playback jumps to its start and stops at its end.

Use the green check for a positive outcome or the red cross for a negative outcome. Select the active result again to clear it.

### Adjust a moment

1. Select **Edit** beside the moment.
2. Change its type if necessary.
3. Enter the start and end times in seconds, or use the current video time.
4. Add optional notes.
5. Select **Save changes**.

The end must be after the start and within the recording duration.

### Delete a moment

Use **Delete** beside a moment, or use the bin below the player to remove the latest moment. Deleting a moment also deletes its submoments and removes it from playlists.

## Mark the match periods

Period markers are required for correct first-half and second-half filtering in Maps.

1. Move to the exact start of the first half and select **1H Start**.
2. Mark **1H End** at half-time.
3. Mark **2H Start** when the second half begins.
4. Mark **2H End** when it finishes.

After a marker is saved, selecting its main area jumps to that time. Use the small clock button beside it to replace the marker with the current time.

Occurrences outside a complete marked period appear as awaiting period markers and are excluded from normal half-based map results.

## Save and upload the complete recording

Live Game stores two related forms of video:

- **Live replay segments**: short pieces used for rewind and collaborative viewing during the match.
- **Complete recording**: the `.webm` file saved to the folder chosen by the camera operator.

Ending live does not automatically upload the complete local file. Upload it after the match so Reports, Playlists, Maps and later analysis can use one continuous video on every authorised device.

### Upload the local recording

1. Open the match.
2. Select **Identify submoments**.
3. Select **Upload new**.
4. Choose the `.webm` file created by Live Game.
5. Keep the page open until upload and finalisation complete.

Large uploads are split into parts and can resume when the same file is selected again after an interruption.

### Use an existing cloud video

Select **Cloud library**, locate the recording and select **Use video**. This links the existing asset without uploading a duplicate.

Verify that the video belongs to the correct match and starts at the same reference time used during live tagging.

## Identify submoments

Select **Identify submoments** after at least one main moment exists.

1. Filter by main-moment type if required.
2. Select a moment or use the previous and next controls.
3. Use **Play all** to review every filtered moment in order.
4. Use `0.5×`, `1×`, `2×` or `4×` to change playback speed.
5. Select the required submoment action.
6. Pause at the exact action time.
7. If requested, select the occurrence position on the pitch and/or destination in the goal.
8. Optionally select the body part: right foot, left foot, head or other.
9. Add notes if needed.
10. Select **Save** followed by the action name.

Saved submoments appear below the form. Select one to return to its timestamp, use the pencil to edit it or the bin to delete it.

## Use Playlists

Every staff member has a default personal playlist. A live moment is automatically added to the default playlist of the person who tagged it.

1. Open **Playlists**.
2. Choose a playlist.
3. Select a clip to review it.
4. Select **Play all** to reproduce every clip in order.
5. Use the bin beside an item to remove it from the playlist without deleting the original moment.

You may create another personal playlist under **New personal playlist**. Shared workspace playlists also appear in the selector.

For playback, Live Game uses the complete cloud video first, a remembered local file second and available live segments as a fallback. If an old session has failed segments, upload its complete local recording to restore playback.

## Use Reports

Reports combine moments from one or more matches.

1. Open **Reports**.
2. Select the required matches, or use **Select all**.
3. Filter by **Moment** and **Submoment** if needed.
4. Choose the **Export quality**.
5. Select one clip, or use **Play all**.
6. Use the pencil to adjust a clip or the bin to delete its original moment.

### Export clips

1. Confirm that every selected match has a complete cloud video or local fallback.
2. Select **Export clips**.
3. Choose the destination folder.
4. Keep the page open until all clips have been processed.

Use **Load local fallback** when cloud video is unavailable. Select the corresponding original files; Live Game matches them by filename. Exporting creates new clips and does not modify the original recording.

## Use Maps

1. Open **Maps**.
2. Select one match or **All matches**.
3. Filter by main moment, submoment and match period.
4. Select a point on the pitch or goal to open its moment video.
5. Select an action button to play all occurrences of that action.
6. Use **Play all** to review all currently filtered occurrences.

The pitch displays original match coordinates. Half filters depend on period markers. If cloud video is unavailable, select **Use local file** and choose the matching recording.

## Settings and shared media

### Edit the analysis model

In **Settings**, use **Edit** to change moment and submoment names, colours, codes, shortcuts and location requirements. Use **Delete** only when the type is no longer needed.

Coordinate shortcut changes before a match so everyone uses the same tagging scheme.

### Link the shared cloud library

The media library can be linked across Live Game and the Player, Team or Opponent analysis applications.

To link Live Game to another application:

1. Create a temporary linking code in the other application.
2. In Live Game, open **Settings** → **Shared cloud library**.
3. Paste the code under **Link this application**.
4. Select **Link**.

To connect another application from Live Game, select **Create linking code**, copy it and paste it into the other application.

Linking codes expire after 30 minutes and work once. Linking makes media available; it does not merge unrelated team databases or match data.

## Backups and data safety

Open **Maintenance** and select **Download data backup** regularly, especially before deleting matches or changing configuration.

The backup contains application data such as matches, moments and settings. Keep complete local recordings separately because a database backup does not replace video files.

Recommended practice:

- Keep two copies of every complete recording.
- Organise folders by season and competition.
- Upload the complete recording after each match.
- Verify playback in Reports or Playlists before deleting a local copy.
- Store invitation and linking codes privately.

## Match-day checklist

### Before leaving

- Confirm match, opponent and competition configuration.
- Confirm moment buttons and shortcuts.
- Charge the camera, capture card and computer.
- Check free disk space.
- Test the production URL and login.

### Before kick-off

- Connect the computer to power and stable internet.
- Open the correct match.
- Connect the correct camera and confirm audio/video.
- Select **Start live** and choose the recording folder.
- Wait for confirmation and the first replay segment.
- Mark **1H Start** at kick-off.

### During the match

- Keep the camera tab open.
- Tag moments with buttons or shortcuts.
- Rewind freely; recording continues.
- Use **Go Live** to return to the current action.
- Mark **1H End**, **2H Start** and **2H End**.

### After the match

- Select **End live** and wait for finalisation.
- Confirm that the `.webm` file exists and plays locally.
- Upload the complete recording.
- Verify a moment in Playlists or Reports.
- Identify submoments and locations.
- Download a data backup.

## Troubleshooting

### The camera does not appear

- Use current Chrome or Edge.
- Confirm camera permission in the address bar.
- Close other applications using the camera.
- Reconnect the capture card and select **Connect camera** again.
- Confirm that the production page uses HTTPS.

### Start live does not begin

- Connect the camera first.
- Choose a writable local folder.
- Use desktop Chrome or Edge, because direct folder recording may not be available elsewhere.
- Confirm another operator did not already start the session.

### The timeline cannot rewind yet

Wait for the first replay segment, normally about five seconds. If it remains unavailable, check the network and ask the administrator to verify cloud storage.

### Rewinding affects another person

It should not. Each device has an independent playhead. Ensure each staff member uses their own device and account.

### A video works in Reports but not in Playlists

Refresh and verify that the complete match video is ready. Playlists use the same complete cloud video and only fall back to live segments when necessary.

### A historical live clip is unavailable

Failed cloud segments cannot be recreated automatically. Upload the complete local recording, ensuring it uses the same timeline start as the live session.

### Maps show no points

- Select a match first.
- Check the moment, submoment and half filters.
- Confirm that the submoment has a pitch or goal location.
- Save all four match-period markers.

### A cloud video cannot be opened

- Refresh to obtain a new temporary playback address.
- Confirm the correct video is attached to the match.
- Use **Load local fallback** or **Use local file** when offered.
- If every device fails, ask the administrator to verify R2 and CORS.

### The complete local video is missing or incomplete

The camera tab may have closed before finalisation. Check the selected folder. Cloud replay segments may still exist, but they do not replace the complete local file.

## Administrator deployment appendix

This section is for the person deploying Live Game, not normal match-day users.

### Local development

1. Copy `.env.example` to `.env.local` or `.env`.
2. Configure PostgreSQL, the authentication secret and Cloudflare R2 credentials.
3. Run `npm install`.
4. Run `npm run prisma:migrate` and `npm run prisma:seed` for a new database.
5. Run `npm run media:push` when initialising the shared media database.
6. Run `npm run dev` and open `http://localhost:3000`.

### Production requirements

- Deploy through HTTPS so camera capture works.
- Add the exact production and local domains to the R2 CORS policy.
- Allow `GET`, `PUT` and `HEAD`.
- Allow `Content-Type` and `Range` request headers.
- Expose `ETag`, `Content-Length`, `Content-Range` and `Accept-Ranges`.
- Never expose R2 secret keys in browser-side variables.
- Keep Live Game database credentials separate from unrelated applications unless sharing is explicitly intended.

### Realtime camera sharing

Realtime camera sharing uses Cloudflare Stream in addition to R2. R2 remains responsible for the rewindable segment archive; Stream distributes the current camera image through WebRTC.

1. Enable Cloudflare Stream on the same Cloudflare account.
2. Create an Account API Token with **Stream Write** permission.
3. Add `CLOUDFLARE_STREAM_ACCOUNT_ID` to the local environment and Vercel.
4. Add `CLOUDFLARE_STREAM_API_TOKEN` to the local environment and Vercel. This secret must never use a `NEXT_PUBLIC_` prefix.
5. Set `CLOUDFLARE_STREAM_RECORDING_MODE` to `off` when R2 and the local file remain the recording sources, or `automatic` when an additional Stream recording is required.
6. Optionally set `CLOUDFLARE_STREAM_ALLOWED_ORIGINS` to a comma-separated list of authorised hostnames.
7. Redeploy Live Game after changing the variables.

When Stream is unavailable or not configured, starting the match still preserves local recording and R2 replay. The operator receives a warning and remote staff continue with the delayed segment feed.

Run `npm run r2:check` to verify R2 credentials without changing existing media. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` before deployment.
