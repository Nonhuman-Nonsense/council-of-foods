import { useTranslation } from 'react-i18next';
import { useMobile } from '../../utils';
import Loading from '../Loading';

function Reconnecting() {

  const isMobile = useMobile();
  const { t } = useTranslation();

  return (
    <div>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", transform: "translateY(-50%)", height: `${(isMobile ? 100 : 150) / 2}px` }}>
        <Loading />
      </div>
      <h2>{t('error.connection')}</h2>
      <p>{t('error.reconnecting')}</p>
    </div>
  );
}

export default Reconnecting;
