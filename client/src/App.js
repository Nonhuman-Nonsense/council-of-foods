import "./App.css";
import Overlay from "./components/Overlay";
import Welcome from "./components/Welcome";
import backgroundImage from "./images/council-of-foods-background.jpg";

function App() {
  const backgroundStyle = {
    backgroundImage: `url(${backgroundImage})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100vh",
    width: "100vw",
  };

  return (
    <div className="App" style={backgroundStyle}>
      <Overlay>
        <Welcome />
      </Overlay>
    </div>
  );
}

export default App;
