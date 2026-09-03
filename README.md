# TubePilot: Channel Commander

Build a professional SaaS web application for managing YouTube channels called TubePilot.



The goal is simple: a user signs into TubePilot, connects a YouTube channel with one click through the official Google OAuth flow, and then manages that channel from the website: upload videos, edit metadata, upload thumbnails, schedule/publish videos, manage playlists, and view channel/video statistics.



1. Design



Create a premium, modern dashboard inspired by professional SaaS products such as Linear and YouTube Studio, without copying them.



Use:



- Dark mode as the default

- Optional light mode

- Black/dark-gray background

- White/gray typography

- YouTube-red accent

- Clean cards, subtle borders, rounded corners

- Smooth but minimal animations

- Excellent responsive design



The website must work perfectly on desktop and mobile.



2. Authentication



Implement secure user authentication using Supabase Auth.



Support:



- Sign up

- Sign in

- Sign out

- Password reset

- User profile



The TubePilot account and the connected YouTube account must be treated separately.



3. Connect YouTube



The main action after login should be:



Connect YouTube Channel



Use the official Google OAuth 2.0 flow and YouTube Data API v3.



The user must NOT have to manually enter:



- Channel ID

- API key

- Access token

- Refresh token

- Google email



The flow should be:



TubePilot → Google OAuth → user selects Google account → grants permissions → OAuth callback → backend securely exchanges the authorization code → retrieve the authorized YouTube channel → save the connection → return to dashboard.



Use server-side handling for OAuth and all sensitive YouTube API operations.



Never expose Google client secrets or tokens in frontend code.



If the authorized Google account provides access to multiple YouTube channels/Brand Accounts, handle this correctly and allow the user to select the intended channel when technically supported.



4. Multiple Channels



Allow one TubePilot user to connect multiple YouTube channels.



Create a channel switcher in the dashboard showing:



- Channel avatar

- Channel name

- Subscriber count

- Connection status



Button:



+ Connect another channel



Allow users to disconnect a channel without deleting anything from YouTube.



5. Dashboard



Create a professional overview page showing the currently selected channel.



Display:



- Subscribers

- Total views

- Total videos

- Recent views

- Recent subscriber growth



Include a date selector:



- 7 days

- 28 days

- 90 days

- 1 year



Show responsive charts for available YouTube analytics.



Use real YouTube data. Never display fake statistics in production.



6. Sidebar



Create these navigation items:



- Overview

- Videos

- Upload

- Upload Queue

- Scheduled

- Playlists

- Analytics

- Channel

- Settings



On mobile, convert this into a suitable mobile navigation/drawer.



7. Videos



Create a video library showing the connected channel's videos.



Each video should show:



- Thumbnail

- Title

- Date

- Visibility

- Views

- Likes

- Comments

- Status



Support:



- Search

- Pagination/infinite scrolling

- Sort

- Filtering



Filters:



Public / Private / Unlisted / Scheduled



Sorting:



Newest / Oldest / Most viewed



8. Upload



Create a dedicated professional upload page.



Allow the user to select a video through:



Drag & Drop or Browse Files



Support large files, including approximately 500–600 MB.



Do NOT load entire large files into server memory.



Use YouTube's resumable upload mechanism where appropriate.



Display:



- Upload percentage

- Uploaded size / total size

- Upload speed

- Estimated remaining time

- Upload status



Example:



Uploading — 64%



After selecting the video, display fields for:



- Title

- Description

- Thumbnail

- Tags

- Category

- Language

- Playlist

- Audience setting

- Visibility



Visibility options:



- Public

- Unlisted

- Private

- Schedule



When Schedule is selected, show:



- Date

- Time

- Time zone



Buttons:



Save Draft

Publish

Schedule



Before publishing/scheduling, show a confirmation summary.



9. Thumbnail



Allow the user to upload and replace a custom YouTube thumbnail.



Show a preview before uploading.



Send it through the appropriate YouTube API endpoint.



10. Video Editing



Clicking an existing video opens an editor.



Allow editing:



- Title

- Description

- Tags

- Category

- Thumbnail

- Visibility

- Playlist

- Language

- Audience settings



Button:



Save Changes



Changes must synchronize with YouTube.



Also provide:



Open on YouTube



and:



Delete Video



Deleting must require confirmation and clearly state that the YouTube video will be permanently deleted.



11. Scheduling



Create a dedicated Scheduled page.



Show:



- Thumbnail

- Title

- Channel

- Scheduled date/time

- Status



Allow:



- Edit

- Reschedule

- Cancel scheduling



Correctly handle time zones.



12. Upload Queue



Create an Upload Queue showing:



- Uploading

- Processing

- Scheduled

- Published

- Failed



Show progress for active uploads.



For failed uploads provide:



Retry



and a human-readable error message.



13. Playlists



Create a Playlists page.



Allow:



- View playlists

- Create playlist

- Edit playlist

- Delete playlist

- View playlist videos

- Add/remove videos



Use the YouTube Data API.



14. Analytics



Create an Analytics page using available YouTube Analytics/API data.



Show:



- Views

- Watch time

- Subscribers gained

- Top-performing videos

- Views over time

- Subscriber growth



Allow date filtering.



If a metric is unavailable through the configured API, do not invent it. Clearly indicate that it is unavailable.



15. Channel



Create a Channel page showing:



- Channel avatar

- Channel name

- Handle

- Description

- Subscribers

- Total views

- Video count

- Channel ID



Buttons:



Refresh Data

Open YouTube Channel

Disconnect Channel



16. Notifications



Create toast notifications and a notification center for events such as:



- Channel connected

- Upload completed

- Upload failed

- Video processing completed

- Video scheduled

- Scheduled video published

- YouTube authorization expired



When authorization expires, show:



Reconnect YouTube



17. Database



Use Supabase.



Create secure tables for:



- User profiles

- YouTube channels

- YouTube OAuth connections

- Videos

- Upload jobs

- Playlists



Every record must belong to the authenticated user.



Use Row Level Security so one user can never access another user's channels, videos, jobs, or credentials.



Store OAuth credentials securely server-side. Encrypt sensitive credentials where appropriate.



18. Backend



Use server-side API routes/functions for:



- Google OAuth

- OAuth callback

- Token refresh

- YouTube API requests

- Video uploads

- Thumbnail uploads

- Video updates

- Playlist operations

- Channel synchronization

- Analytics



Do not put privileged YouTube operations directly in client-side code.



19. Environment Variables



Create an ".env.example" containing placeholders for:



GOOGLE_CLIENT_ID

GOOGLE_CLIENT_SECRET

GOOGLE_REDIRECT_URI

SUPABASE_URL

SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY



Never hard-code secrets.



20. Error Handling



Handle:



- Expired OAuth tokens

- Revoked authorization

- API quota limits

- Network failures

- Upload failures

- Invalid files

- Invalid thumbnails

- YouTube processing errors



Do not show raw technical API errors to normal users.



Instead show clear messages such as:



Your YouTube connection has expired. Please reconnect your channel.



or:



YouTube API quota has been reached. Please try again later.



21. Mobile



The entire application must be mobile-first and fully usable on phones.



A mobile user must be able to:



- Connect a channel

- Select a video from phone storage

- Upload a large video

- Enter title/description

- Select thumbnail

- Schedule

- Publish

- Manage existing videos



Do not simply scale the desktop UI down; create an appropriate mobile layout.



22. Important Requirements



Do NOT build a fake YouTube connection.



Do NOT create a manual "enter channel ID" system.



Do NOT use fake statistics.



Do NOT expose OAuth tokens or secrets.



Do NOT create buttons that appear functional but do nothing.



If an external API credential is missing, show a clear configuration message instead of pretending the feature works.



Prioritize real functionality over decorative UI.



Build the project as a production-ready application with clean TypeScript architecture, reusable components, proper loading states, skeletons, validation, error handling, responsive layouts, and secure backend operations.



The final user experience should be:



Sign up → Connect YouTube → Select channel → Dashboard → Upload video → Add metadata → Upload → Publish/Schedule → Manage video → View analytics.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pilot-plus.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1dfef0fb-80d6-4442-b55e-ad7942f0dd3f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
