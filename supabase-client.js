(function() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;

    if (!url || !key) {
        console.warn('[Supabase] SUPABASE_URL or SUPABASE_ANON_KEY is missing. Set them in the page before loading supabase-client.js.');
    }

    const supabaseClient = supabase.createClient(url, key);

    function isoTimeFromHHMM(value) {
        const [hours, minutes] = value.split(':').map(Number);
        const now = new Date();
        const scheduledAt = new Date(now);
        scheduledAt.setHours(hours, minutes, 0, 0);
        if (scheduledAt < now) {
            scheduledAt.setDate(scheduledAt.getDate() + 1);
        }
        return scheduledAt.toISOString();
    }

    function formatScheduleTime(iso) {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return iso;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    async function fetchSchedule() {
        const { data, error } = await supabaseClient
            .from('palinsesto')
            .select('id, name, url, scheduled_at')
            .order('scheduled_at', { ascending: true });

        if (error) {
            console.error('[Supabase] fetchSchedule error:', error);
            return [];
        }

        return (data || []).map(item => ({
            ...item,
            time: formatScheduleTime(item.scheduled_at)
        }));
    }

    async function addScheduleItem(item) {
        const scheduled_at = item.scheduled_at || isoTimeFromHHMM(item.time || item.scheduleTime);
        const payload = {
            name: item.name,
            url: item.url,
            scheduled_at
        };

        const { data, error } = await supabaseClient
            .from('palinsesto')
            .insert(payload)
            .select('id, name, url, scheduled_at')
            .single();

        if (error) {
            console.error('[Supabase] addScheduleItem error:', error);
            throw error;
        }

        return {
            ...data,
            time: formatScheduleTime(data.scheduled_at)
        };
    }

    async function deleteScheduleItem(id) {
        if (!id) return false;
        const { error } = await supabaseClient
            .from('palinsesto')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[Supabase] deleteScheduleItem error:', error);
            return false;
        }
        return true;
    }

    async function cleanupOldScheduleItems(items) {
        if (!Array.isArray(items) || items.length === 0) return;

        const now = new Date();
        const itemsToDelete = items.filter(item => {
            const scheduledAt = new Date(item.scheduled_at);
            return !Number.isNaN(scheduledAt.getTime()) && now - scheduledAt > 1000 * 60 * 60;
        });

        if (itemsToDelete.length === 0) return;

        for (const item of itemsToDelete) {
            await deleteScheduleItem(item.id);
        }
    }

    window.fetchSchedule = fetchSchedule;
    window.addScheduleItem = addScheduleItem;
    window.deleteScheduleItem = deleteScheduleItem;
    window.cleanupOldScheduleItems = cleanupOldScheduleItems;
    window.formatScheduleTime = formatScheduleTime;
    window.isoTimeFromHHMM = isoTimeFromHHMM;
})();
