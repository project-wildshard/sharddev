# Account-only uploads (MU2 / SS-NE31)

Upload now uses the saved account credential without requiring a shared
creator private key. A configured creator key still signs exactly as before.
The account bearer stays on the ticket and commit only, never public reads
or the object-store PUT. The real CLI regression uses its saved account key
with no creator key in its environment.
