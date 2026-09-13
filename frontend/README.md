# Loop Finder Frontend

A React interface for the loop-finder audio analysis tool.

## Getting Started

### Prerequisites
- Node.js (v14+)
- npm or yarn

### Installation
```bash
npm install
```

### Available Scripts

In the project directory, you can run:

#### `npm start`
Runs the app in development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

#### `npm test`
Launches the test runner in interactive watch mode.

#### `npm run build`
Builds the app for production to the `build` folder.

### Environment Variables
Create a `.env` file in the root directory:

```
REACT_APP_API_URL=http://localhost:8000
```

This tells the frontend where to find the backend API.

## Project Structure
- `src/components/` - Reusable UI components
- `src/services/` - API service layer
- `src/App.tsx` - Main application component