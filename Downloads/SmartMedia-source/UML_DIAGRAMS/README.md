# SmartMedia UML Diagrams

This folder contains 14 comprehensive UML diagrams that document the SmartMedia project architecture, design, and workflows.

## How to View the Diagrams

These diagrams are written in **PlantUML** format (`.puml` files). To view them:

### Option 1: VS Code Extension (Recommended)
1. Install the **PlantUML extension** in VS Code
2. Install **Java** (required by PlantUML)
3. Install **Graphviz** (for better rendering)
4. Open any `.puml` file and press `Alt+D` to preview

### Option 2: Online Viewer
1. Visit http://www.plantuml.com/plantuml/uml/
2. Copy the content of any `.puml` file
3. Paste into the text area
4. View the rendered diagram

### Option 3: Export to Images
```bash
# Install PlantUML CLI
npm install -g node-plantuml

# Generate PNG images
plantuml *.puml

# This will create PNG files for all diagrams
```

## Diagram Index

### 1. System Architecture Diagram
**File:** `01_System_Architecture.puml`

**Description:** High-level overview of the SmartMedia system architecture showing the layers and components:
- Presentation Layer (React UI, Framer Motion, Zustand)
- Application Layer (Electron Main, IPC Bridge, File System)
- AI Processing Layer (Python Engine, Qwen2-VL, Face Recognition)
- Data Layer (SQLite, Face Database, File System)

**Key Insights:**
- Multi-tier architecture with clear separation of concerns
- IPC communication between renderer and main process
- Python subprocess for AI processing
- Multiple data storage mechanisms

---

### 2. Use Case Diagram
**File:** `02_Use_Case_Diagram.puml`

**Description:** Complete use case model showing all user interactions with the system:
- Image Management (Add, View, Search, Delete, Favorite)
- AI Features (Scan, Caption, Detect Objects/Faces/Emotions, Chat)
- Organization (Smart Albums, Custom Albums, Emotions, Faces)
- Editing & Privacy (Edit, Filter, Export, Lock)
- Settings (Configure, Manage Models, Reset)

**Actors:**
- User (primary actor)
- System Administrator
- Python AI Engine
- File System
- SQLite Database

---

### 3. Class Diagram - Frontend Components
**File:** `03_Class_Diagram_Frontend.puml`

**Description:** Object-oriented design of the React frontend:
- Main App component and routing
- Page components (HomePage, AlbumsPage, FacesPage, ScanningScreen)
- Reusable components (PhotoViewer, AIChatbot, Sidebar, ProcessingStatusBadge)
- State management with Zustand Store
- Data models (ImageMetadata, Album, ScanProgress, EditState)

**Key Classes:**
- `App`: Root component with screen routing
- `HomePage`: Main gallery with masonry/grid view
- `PhotoViewer`: Full-screen viewer with editing capabilities
- `AppStore`: Global state management

---

### 4. Class Diagram - Backend Classes
**File:** `04_Class_Diagram_Backend.puml`

**Description:** Backend architecture showing Electron and Python classes:
- Electron Main Process (ElectronMain, IPCHandlers, ProcessingQueue)
- Database Management (DatabaseManager)
- Python AI Engine (SmartMediaEngine, FaceDatabase, ModelDownloader)
- Image Processing (ImageProcessor)
- Data Models (ProcessingTask, AIResponse, Face, FaceData)

**Key Classes:**
- `ElectronMain`: Main process orchestration
- `SmartMediaEngine`: Core AI processing engine
- `FaceDatabase`: Face recognition storage and matching
- `ProcessingQueue`: Background task management

---

### 5. Sequence Diagram - Image Upload Flow
**File:** `05_Sequence_Image_Upload.puml`

**Description:** Step-by-step sequence of events when a user adds and processes images:
1. User selects files
2. Images queued for processing
3. Python engine processes each image
4. Qwen2-VL model performs AI analysis
5. Face detection and recognition
6. Save to database
7. Update UI with results

**Interactions:**
- User → HomePage → Electron → Python → Qwen2-VL
- Face detection → FaceDatabase
- Results → SQLite → UI updates

**Timing:**
- First image: 25-30 seconds
- Subsequent images: 20-25 seconds

---

### 6. Sequence Diagram - AI Chat Interaction
**File:** `06_Sequence_AI_Chat.puml`

**Description:** Detailed flow of AI chatbot interactions:
- Text search queries
- Image-based Q&A
- Metadata requests
- Complex multi-criteria searches
- Natural language understanding

**Query Types:**
- "Show me photos from the beach" → Tag/object filtering
- "What's in this photo?" → Vision-language analysis
- "Find photos of people smiling at events" → Multi-filter search

---

### 7. Activity Diagram - Image Scanning Process
**File:** `07_Activity_Scanning_Process.puml`

**Description:** Complete workflow of image scanning and AI analysis:
- File selection and queue initialization
- Python engine initialization
- Image preprocessing (resize, hash calculation)
- AI analysis (objects, scene, caption, tags)
- Album categorization logic
- Face recognition pipeline
- Emotion detection
- Database storage
- UI updates

**Parallel Activities:**
- Model loading (first time only)
- Display scanning UI
- Multi-fork AI analysis

---

### 8. Activity Diagram - Search and Filter Operations
**File:** `08_Activity_Search_Filter.puml`

**Description:** User search and filtering workflows:
- Text search with debouncing
- Tag-based filtering (AND logic)
- Smart album navigation
- Emotion-based filtering
- Face-based filtering
- Favorites filtering

**Features:**
- Multi-criteria filtering
- Real-time results
- Clear filter options
- Empty state handling

---

### 9. Component Diagram
**File:** `09_Component_Diagram.puml`

**Description:** Component-level architecture showing interfaces and dependencies:
- Desktop Application Layer (Electron, React, Preload Bridge)
- State Management Layer (Zustand Store, LocalStorage)
- AI Processing Layer (Python Engine, Qwen2-VL, Face Recognition)
- Data Layer (SQLite, Face Database, File System)
- External Services (HuggingFace Model Hub, OS APIs)

**Interfaces:**
- IPC communication ports
- State updates/actions
- Commands/results
- Queries/results

---

### 10. Deployment Diagram
**File:** `10_Deployment_Diagram.puml`

**Description:** Physical deployment architecture on user's Windows PC:
- Electron Container (Main Process, Renderer Process)
- Python Runtime (main.py, SmartMediaEngine)
- AI Models (Qwen2-VL 4GB, face_recognition)
- Databases (SQLite, Face Pickle)
- Application Data folders
- Media folder (user photos)
- Optional Docker deployment

**System Requirements:**
- Windows 10/11
- 8GB RAM (16GB recommended)
- ~6GB disk space
- Multi-core CPU
- Optional GPU

---

### 11. State Diagram - Image Processing States
**File:** `11_State_Diagram_Processing.puml`

**Description:** State machine for image lifecycle:
- **Discovered** → Image selected by user
- **Queued** → Waiting for processing
- **Processing** → AI analysis in progress
  - Sub-states: Loading, Preprocessing, AI Inference, Face Detection, Categorization
- **Completed** → Successfully processed
  - Sub-states: InGallery, Favorited, Edited, InAlbum, Locked, Trashed
- **Failed** → Error occurred (with retry logic)
- **Trashed** → Soft-deleted (30-day retention)

**Transitions:**
- Success/failure paths
- Edit operations
- Album additions
- Locker movements
- Delete/restore

---

### 12. Entity Relationship Diagram (ERD)
**File:** `12_ERD_Database.puml`

**Description:** Database schema and relationships:
- **images** table (primary entity)
- **albums** table (smart and custom)
- **album_images** junction table (many-to-many)
- **faces** table (face recognition)
- **face_images** junction table
- **metadata** JSON structure (embedded in images)
- **locker_settings** table
- **user_preferences** table

**Relationships:**
- One-to-many: images ← album_images → albums
- Many-to-many: images ↔ faces
- One-to-one: images → metadata (JSON)

---

### 13. Sequence Diagram - Photo Viewer Interaction
**File:** `13_Sequence_Photo_Viewer.puml`

**Description:** Detailed interaction flow in the PhotoViewer component:
- Basic viewing and navigation
- Metadata panel display
- Editing mode (brightness, contrast, filters)
- Save as copy vs. overwrite original
- AI chat integration
- Tag management
- Favorite toggle
- Delete confirmation

**Features:**
- Non-destructive editing
- Real-time preview
- Keyboard shortcuts
- AI-powered suggestions

---

### 14. Activity Diagram - Album Organization
**File:** `14_Activity_Album_Organization.puml`

**Description:** Complete album management workflow:
- Smart album generation (Documents, Selfies, Events, Locations, Others)
- Face album generation (person-based)
- Custom album creation
- Add images to albums
- Edit album details
- Delete albums
- Sort and search albums

**Album Types:**
1. **Smart Albums** (AI-generated, read-only)
2. **Face Albums** (auto-generated from face recognition)
3. **Custom Albums** (user-created, fully editable)

---

## Diagram Categories

### Structural Diagrams
- System Architecture
- Component Diagram
- Class Diagrams (Frontend & Backend)
- Deployment Diagram
- Entity Relationship Diagram

### Behavioral Diagrams
- Use Case Diagram
- Sequence Diagrams (Image Upload, AI Chat, Photo Viewer)
- Activity Diagrams (Scanning, Search/Filter, Album Organization)
- State Diagram (Image Processing)

## Technical Details

### Notation Used
- **PlantUML syntax**: Industry-standard diagram-as-code
- **UML 2.5 standard**: Following official UML specifications
- **Custom themes**: Cerulean-outline theme for readability

### Color Coding
- **Blue**: Primary components and actions
- **Green**: Success states and positive flows
- **Red**: Error states and warnings
- **Yellow**: Warnings and important notes
- **Gray**: Background and secondary elements

## Best Practices

When reading these diagrams:
1. Start with the **System Architecture** for overall context
2. Review **Use Case Diagram** to understand functionality
3. Dive into **Class Diagrams** for implementation details
4. Follow **Sequence Diagrams** for interaction flows
5. Use **Activity Diagrams** for process understanding
6. Reference **ERD** for data structure

## Maintenance

To update diagrams:
1. Edit the `.puml` source files
2. Regenerate images (if exporting)
3. Update this README if new diagrams are added
4. Keep diagrams in sync with code changes

## Export Formats

PlantUML supports multiple export formats:
- **PNG**: For documentation and presentations
- **SVG**: For scalable web display
- **PDF**: For printing
- **LaTeX**: For academic papers
- **ASCII Art**: For plain text documentation

## Tools & Resources

**Recommended Tools:**
- PlantUML VS Code Extension
- PlantUML IntelliJ Plugin
- PlantUML Sublime Text Package
- Online PlantUML Editor

**Resources:**
- [PlantUML Official Site](https://plantuml.com/)
- [PlantUML Language Reference](https://plantuml.com/guide)
- [UML Tutorial](https://www.uml-diagrams.org/)

---

**Created:** January 24, 2026
**Project:** SmartMedia - AI-Powered Media Organizer
**Type:** Final Year Project
**Author:** [Your Name]
