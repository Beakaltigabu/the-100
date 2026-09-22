import Button from './Button';
import { useLanguage } from '../context/LanguageContext';

export default function TelegramBridge({ telegram, onJoinBot, onJoinGroup }) {
  const { t } = useLanguage();
  if (!telegram || telegram.configured === false) return null;
  const connected = telegram.state === 'active';

  return (
    <section className="telegram-bridge">
      <p className="rail-kicker">{t('theConversationContinues')}</p>
      <p className="telegram-bridge__support">{t('telegramSupport')}</p>
      {connected ? (
        <>
          <p className="telegram-bridge__status">{t('youInTheCommunity')}</p>
          {telegram.groupLink ? (
            <Button variant="secondary" size="sm" full onClick={onJoinGroup}>
              {t('joinCommunityGroup')}
            </Button>
          ) : null}
        </>
      ) : (
        <Button variant="primary" size="sm" full onClick={onJoinBot}>
          {t('joinCommunity')} →
        </Button>
      )}
    </section>
  );
}