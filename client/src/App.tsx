import './i18n';
import { BrowserRouter } from "react-router";
import Main from "./components/Main";

function App(): React.ReactElement {
  return (
    <div className="App">
      <BrowserRouter>
        <Main lang="en" />
      </BrowserRouter>
    </div>
  );
}

export default App;
