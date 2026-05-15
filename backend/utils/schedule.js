export const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const isWorkDayForUser = (user, date) => {
  if (!date) return true;
  if (user.blockedDates?.includes(date)) return false;
  if (user.extraWorkDates?.includes(date)) return true;

  const [year, month, day] = date.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  const key = DAY_KEYS[dateObj.getDay()];
  return user.workDays?.[key] === true;
};

export const getWorkScheduleForDate = (user, date) => {
  if (!date) return user.workSchedule;

  const [year, month, day] = date.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  const key = DAY_KEYS[dateObj.getDay()];
  return user.workSchedules?.[key]?.start && user.workSchedules?.[key]?.end
    ? user.workSchedules[key]
    : user.workSchedule;
};

export const isSlotBlockedForUser = (user, date, time) => {
  if (!date || !time) return false;
  return user.blockedSlots?.some((slot) => slot.date === date && slot.time === time) === true;
};

export const generateTimeSlots = (workSchedule, interval = 30) => {
  if (!workSchedule?.start || !workSchedule?.end) return [];

  const { start, end } = workSchedule;
  if (!TIME_RE.test(start) || !TIME_RE.test(end) || !Number.isFinite(interval) || interval <= 0) {
    return [];
  }

  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  if (startMin >= endMin) return [];

  const slots = [];
  for (let m = startMin; m < endMin; m += interval) {
    const h = String(Math.floor(m / 60)).padStart(2, "0");
    const min = String(m % 60).padStart(2, "0");
    slots.push(`${h}:${min}`);
  }

  return slots;
};
