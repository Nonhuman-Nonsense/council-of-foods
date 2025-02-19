function CouncilError() {

  return (
      <div>
        <img alt="error" src="/error.png" style={{height: "80px", opacity: "0.7"}} />
        <h2>ERROR</h2>
        <p>Something went wrong...</p>
        <a href="/"><button style={{marginTop: "10px"}}>Restart</button></a>
      </div>
  );
}

export default CouncilError;
