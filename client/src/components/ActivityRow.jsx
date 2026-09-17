import './ActivityRow.css';
import { useLanguage } from '../context/LanguageContext';

export default function ActivityRow({ activity, unit = 'km', onDelete }) {
  const { t } = useLanguage();
  return (
    <div className="activity-row">
      <div className="activity-row__body">
        <div className="activity-row__distance">
          {Number(activity.quantity ?? activity.distance)} {t(unit)}
        </div>
        <div className="activity-row__type">
          {t(activity.activity_type)} · {t(activity.source)}
        </div>
      </div>
      {activity.source === 'manual' && onDelete ? (
        <button className="activity-row__delete" onClick={() => onDelete(activity)}>
          {t('delete')}
        </button>
      ) : null}
    </div>
  );
}