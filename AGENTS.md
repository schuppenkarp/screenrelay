# Maintaining ScreenRelay

- Read README.md, docs/architecture.md, docs/development.md and docs/updates.md before changing architecture or deployment.
- Keep application behavior in small modules. Admin markup belongs in public/templates, not large HTML strings in JavaScript. Assign user content through DOM properties or the existing sanitized rich-text renderer.
- Keep organization details, media, credentials, auth sessions and local deployment files out of Git and Docker images. Run npm run release:check before committing or exporting.
- Existing installations use the Compose project wallrelay and its data volume. Do not rename those resources during updates.
- Updates are started by the server administrator using UPDATE.cmd. The web application must not receive Docker socket access or trigger privileged host commands.
- A release tag vX.Y.Z must match package.json and package-lock.json. Update CHANGELOG.md; never move an already published release tag.
- Preserve original images and archival behavior. Explicit group rules override wildcard rules.
- Run npm run check, npm run format:check and meaningful tests for changed behavior. The Docker browser check covers UI changes. Never use production WhatsApp or data as test fixtures.
- Deployment health checks are not proof of WhatsApp authentication or camera connectivity; report them separately.
