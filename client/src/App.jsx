import './i18n';
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import Main from "./components/Main";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {/* Add supported languages here */}
          <Route path="/en/*" element={<Main lang="en" />} />
          <Route path="/sv/*" element={<Main lang="sv" />} />
          {/* Default */}
          <Route path="/*" element={<Navigate to="/en/" />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
