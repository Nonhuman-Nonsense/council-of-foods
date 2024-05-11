import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import { CouncilProvider } from "./components/CouncilContext";

function App() {
  return (
    <div className="App">
      <CouncilProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={<Home />}
            />
            <Route
              path="about"
              element={<About />}
            />
            <Route
              path="contact"
              element={<Contact />}
            />
            <Route
              path="*"
              element={<NotFound />}
            />
          </Routes>
        </BrowserRouter>
      </CouncilProvider>
    </div>
  );
}

export default App;
