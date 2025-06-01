import { useMobile } from '../../utils';
import Loading from '../Loading';

function Reconnecting() {

  const isMobile = useMobile();

  return (
      <div>
        <div style={{position: "relative", display: "flex", justifyContent: "center", transform: "translateY(-50%)", height: `${(isMobile ? 100 : 150)/2}px`}}>
          <Loading />
        </div>
        <h2>Connection Lost</h2>
        <p>Attempting to reconnect...</p>
      </div>
  );
}

export default Reconnecting;
