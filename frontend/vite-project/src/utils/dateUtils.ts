// rounds timestamp to hours:minutes in EST
export const roundToMinute = (timestamp: string): string => {
    if(!timestamp) return '';
    const date = new Date(timestamp);
    date.setSeconds(0, 0);
    return date.toLocaleTimeString("en-US", {timeZone: "America/New_York", hour: '2-digit', minute: '2-digit'});
}

// formats timestamp to date and time in EST
export const formatDateTime = (timestamp: string): string => {
    if(!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
