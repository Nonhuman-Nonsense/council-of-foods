import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import About from "./components/overlays/About";
import Contact from "./components/overlays/Contact";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route
            element={<Home />}
            path="*"
          >
            <Route
              path="about"
              element={<About />}
            />
            <Route
              path="contact"
              element={<Contact />}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
