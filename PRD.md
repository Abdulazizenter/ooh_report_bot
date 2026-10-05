# Product Requirements Document (PRD)

**Document ID**: PRD-20261005-OOH_REPORT_BOT  
**Version**: 1.0.0  
**Owner / Author**: Lead Product Manager (Antigravity x1000)  
**Status**: DRAFT  
**Target Release**: MVP v1.0 + Future Roadmap  

---

## 1. Problem Statement & Context
- **Customer Struggling Moment**: Out-of-Home (OOH) advertising placements are plagued by reporting fraud. Field contractors often upload old photos from galleries or spoof locations, making it impossible for agencies and brand clients to verify if ads are actually displayed correctly at the contracted time and location.
- **Business Opportunity**: By forcing real-time, tamper-proof reporting through a Telegram WebApp, the business eliminates reporting fraud. This increases client trust, improves operational efficiency, and prevents revenue loss from unverified placements.
- **Target Audience / Personas**: 
  - **Primary: Field Specialist (Монтажник/Проверяющий)** – Uses the Telegram WebApp on site to take photos and submit reports. Operates in varying weather, lighting, and network conditions. Needs a fast, foolproof tool.
  - **Secondary: Key Account Manager (KAM/Менеджер)** – Reviews incoming reports, validates data, and aggregates reports for clients. Needs bulk tools and reliable data.
  - **Tertiary: Brand Client (Клиент)** – Consumer of the final verified reports. Needs absolute confidence in the authenticity of the photo proof.

---

## 2. Jobs-To-Be-Done (JTBD)
- **Primary Job (Field Specialist)**:
  > When `I arrive at an OOH advertising structure`,  
  > I want to `quickly capture and submit a verifiable photo report`,  
  > So I can `prove the job is done and get paid without disputes`.
- **Forces of Change**:
  - **Push**: The current process of taking regular photos, sending them via chat, and arguing over their authenticity is slow and frustrating.
  - **Pull**: A single-button Telegram WebApp that automatically handles location, time, and watermarking is frictionless.
  - **Anxiety**: Field specialists fear the app will fail if there is no internet connection at the billboard location, or that the camera will drain the battery.

---

## 3. User Journey & Core Workflows
Step-by-step end-to-end path through the system (Field Specialist Flow):
1. **Trigger / Entry**: User opens the `ooh_report_bot` in Telegram and launches the WebApp.
2. **Action State**: The app requests Camera and Location permissions. The UI presents a live camera viewfinder. User taps "Capture".
3. **Immediate Feedback**: The app immediately freezes the frame (optimistic update within 150ms).
4. **Processing & Watermarking**: The system extracts Exif/Browser location, current timestamp, and matches it to the assigned Contractor and Construction. A 4-pillar digital watermark is overlaid on the image.
5. **Completion State**: The report is queued and successfully synced to the backend. A success toast is shown.
6. **Recovery Flow (Offline)**: If the network is unavailable, the captured report and metadata are saved in `localStorage`/IndexedDB. An "Offline Mode: Syncing Later" badge is shown. When connectivity returns, the `offline_queue_sync` process automatically pushes pending reports.

---

## 4. Functional Invariants & Business Rules
- **Rule 1: Anti-Fraud Invariant (No Gallery)**: Uploading from the device gallery is strictly prohibited. All media must be captured via the live camera stream inside the WebApp.
- **Rule 2: GPS Tolerance (Geofencing)**: The captured GPS coordinates must be within a $\le 300$ meter radius of the known advertising construction's location.
- **Rule 3: Time-to-Live (Age Limit)**: A captured report must be synced within $\le 180$ seconds to be considered a live capture (except for items legitimately captured and timestamped in offline mode by the `offline_queue_sync` engine).
- **Rule 4: Role Isolation**: Field Specialists can only submit reports. Only KAMs can approve/reject reports or generate aggregate analytics.

---

## 5. Non-Functional & Edge-Case Invariants
- **Offline / Degraded Network UX**: The WebApp operates seamlessly offline. Captured photos and 4-pillar metadata are cached locally. The UI clearly communicates the offline state without blocking the user from capturing subsequent boards.
- **Touch Target Ergonomics**: All primary action buttons (e.g., Capture, Sync) must be minimum 44×44px hit areas to account for gloved hands or cold weather. Must implement iOS safe-area insets to prevent UI overlap with system bars.
- **Fail-Safe Recovery**: Zero silent data loss. Automatically cache capture payloads in local storage.
- **Performance Budget**: Camera initialization under 1000ms. Capture-to-feedback under 150ms.

---

## 6. Acceptance Criteria (Given-When-Then)
- **Scenario 1: Happy Path (Live Capture)**
  - **Given** a Field Specialist is at the correct location with a stable network.
  - **When** they capture a photo via the WebApp.
  - **Then** the photo is watermarked, sent to the server, validated against the 300m GPS and 180s TTL constraints, and marked as "Verified".

- **Scenario 2: Edge Case / Network Failure (Offline Sync)**
  - **Given** a Field Specialist is at the correct location but has zero network bars.
  - **When** they capture a photo.
  - **Then** the payload is saved offline, the user receives an "Offline Mode: Saved" toast, and the payload bypasses the 180s network TTL upon automatic sync when reconnected (using original trusted offline timestamp).

- **Scenario 3: Anti-Fraud Violation (Spoofing)**
  - **Given** a malicious user attempts to intercept the API or send a photo where GPS delta > 300m.
  - **When** the payload hits the backend `mediaAnalysisEngine`.
  - **Then** the system permanently rejects the payload, logs a security audit event, and alerts the KAM.

---

## 7. Metrics & Definition of Success
- **Adoption Metric**: 95% of active field contractors transition to using the WebApp within 30 days.
- **Task Success Rate**: > 98% of legitimate on-site captures pass the anti-fraud validation.
- **Fraud Reduction**: 100% elimination of gallery-upload spoofing.
- **Error / Dropout Rate**: Target < 2% of sync failures.

---

## 8. Future Roadmap & Iterations
Based on the product audit (Score: 8.9/10), the following features are prioritized for the next cycle:
1. **Telegram Push Notifications**: Proactive alerts for KAMs when a route is completed or a fraudulent attempt is blocked, and nudges to Field Specialists for overdue boards.
2. **Bulk Actions for KAMs**: A dedicated managerial dashboard for approving, rejecting, and commenting on dozens of reports simultaneously, replacing one-by-one moderation.
3. **PDF Exports for Brand Clients**: Automated generation of branded, immutable PDF report dossiers containing the watermarked photos and metadata for final client sign-off.
