# Real-Time Project Management System

A premium, state-of-the-art collaborative project management application with real-time updates, event auditing, soft-deletions, Kanban boards, and a multi-user workspace system. Built on a robust stack with **React + TypeScript** on the frontend, and **Node.js + Express + MongoDB + Redis** on the backend, fully containerized using **Docker Compose** for plug-and-play local execution.

---

## 🚀 Key Features

### 1. Collaborative Kanban Board & Tasks
- **Live Syncing**: Card status moves, content updates, and assignee assignments sync across all connected clients in real-time using Socket.IO without page refreshes.
- **Independent Scrollbars**: Each column (`To Do`, `In Progress`, `Review`, `Done`) scrolls independently, keeping the navigation, header, and workspace sidebar fixed.
- **Filters**: Quickly filter board tasks locally by:
  - **Status** (All, To Do, In Progress, Review, Done)
  - **Assignee** (All, Unassigned, or specific project member)
- **Bulk Selection & Deletion**: Toggle "Bulk Action Select" to select multiple tasks and delete them at once. A confirmation dialog prevents accidental loss.
- **Custom Confirmation Modals**: Beautiful, glassmorphic modals for deletions instead of native browser prompts.

### 2. Task Details & History Modal
- **In-place Editing**: Open a card to edit the title (max 200 chars) and description (max 2000 chars) with live character counters.
- **Assigned To Dropdown**: Real-time dropdown populated with all project workspace members (Owner + invited members).
- **Status Selector**: Transition cards across lanes directly from the details view.
- **Task Timeline/History**: Click the history icon to open a task-specific audit feed showing who created, updated, reassigned, or moved the task.

### 3. Workspace Dashboard & Resilient Project Archiving
- **Partitioned Project Tabs**: Active project workspaces and archived workspaces are separated into dedicated tabs:
  - **Active Projects**: Standard read/write workspaces.
  - **Archived Projects**: Read-only soft-deleted workspaces.
- **Resilient Archiving Check**:
  - If a workspace has **no tasks**, deleting it removes it permanently from the database.
  - If it **contains tasks**, it is soft-deleted: the workspace `isDeleted` flag is updated to `true`, all its tasks are soft-deleted, and it is moved to the "Archived Projects" tab with redirection to the board disabled.

### 4. Consolidated Activity Feeds
- **Workspace Timeline**: Side-drawer panel displaying chronological events for the entire workspace. Combines project events (creation, edits, invites) and task events (creation, status updates, assignees, deletions) with user identity details.

### 5. Secure Session Lifecycle
- **JWT Authorization**: Configured for enterprise stability.
  - **Access Tokens**: Valid for **4 hours** (`"4h"`).
  - **Refresh Tokens**: Valid for **7 days** (`"7d"`), stored in secure HTTP-only cookies.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, TanStack Query (React Query) v5, Lucide Icons, Axios, Socket.IO Client.
- **Backend**: Node.js, Express, MongoDB (Mongoose), Redis (Caching & Sockets), Socket.IO, Zod (Schema validation).
- **Infrastructure**: Docker, Docker Compose (for fast multi-container orchestration).

---

## Updated Branch
- staging


## 🗂️ Repository Structure

```
├── backend/
│   ├── src/
│   │   ├── controllers/      # Route request handlers
│   │   ├── models/           # Mongoose schemas (User, Project, Task, Events)
│   │   ├── routes/           # REST endpoints mapping
│   │   ├── services/         # Core business logic (Project, Task, Event tracking)
│   │   ├── sockets/          # Socket.IO connection and room event handlers
│   │   └── validations/      # Zod request validators
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/              # Axios HTTP client configuration
│   │   ├── context/          # Auth Context provider
│   │   ├── features/
│   │   │   ├── dashboard/    # Sidebar and root panel containers
│   │   │   ├── projects/     # Project components, hooks, types
│   │   │   └── tasks/        # Kanban, card, details, bulk actions, and sockets
│   │   └── main.tsx
│   ├── Dockerfile
│   └── vite.config.ts
├── docs/                     # API and database model specifications
├── docker-compose.yml        # Orchestrates Redis, MongoDB, Backend, and Frontend
└── .env                      # Global environment configurations
```

---

## ⚡ Quick Start with Docker (Recommended)

To spin up the application layer, databases, caches, and administration panels with zero local machine installations:

### 1. Clone the Ecosystem
```bash
git clone git@github.com:SIMAR01/project-management-system.git
cd project-management-system
```

### 2. Hydrate Configurations
```bash
cp backend/.env.example backend/.env
```
Ensure your root environment layout points to the target internal API route:
```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

### 3. Initialize Orchestration Components
```bash
# Boot the ecosystem in detached mode
docker compose up -d

# Stream cluster telemetry logs
docker compose logs -f
```

### 4. Port Allocations & Access
*   **Frontend UI Gateway**: [http://localhost:3000](http://localhost:3000)
*   **Backend REST Gateway**: [http://localhost:5000](http://localhost:5000)
*   **Mongo Express Panel**: [http://localhost:8081](http://localhost:8081)
*   **Redis Insight Dashboard**: [http://localhost:5540](http://localhost:5540)

To tear down active storage arrays and systems, safely invoke:
```bash
docker compose down
```

---

## 🛠️ Local Development (Manual Boot)

If you prefer to run services manually outside of container networks:

### Pre-requisites
Ensure active, unauthenticated instances of **MongoDB** (`port 27017`) and **Redis** (`port 6379`) are active on your local loopback array.

### Backend Initialization
```bash
cd backend
npm install
npm run dev
```

### Frontend Initialization
```bash
cd ../frontend
npm install
npm run dev
```
4. Boot the developer API server:
   ```bash
   npm run dev
   ```

### Frontend
1. Navigate to `/frontend` and install dependencies:
   ```bash
   npm install
   ```
2. Start the Vite server locally on port 3000:
   ```bash
   npm run dev
   ```