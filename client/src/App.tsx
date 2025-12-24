import './i18n';
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import Main from "./components/Main";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {(AVAILABLE_LANGUAGES as readonly string[]).length === 1 ? (
            <Route path="/*" element={<Main lang={AVAILABLE_LANGUAGES[0]} />} />
          ) : (
            <>
              {AVAILABLE_LANGUAGES.map((lang) => (
                <Route key={lang} path={`/${lang}/*`} element={<Main lang={lang} />} />
              ))}
              <Route path="/*" element={<Navigate to={`/${AVAILABLE_LANGUAGES[0]}/`} />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
