import './i18n';
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import Main from "./components/Main";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route exact path="/" element={<Navigate to="/en/" />} />
          <Route path="/:lang/*" element={<Main />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
