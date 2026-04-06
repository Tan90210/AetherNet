import { useCallback } from 'react';
import { useSandbox } from '../contexts/SandboxContext.jsx';

export default function useLocalFS() {
    const sandbox=useSandbox();

    const linkAndScan=useCallback(async () => {
        const handle=await sandbox.linkFolder();
        if (!handle) return null;
        sandbox.setLinkedAt(new Date());
        await sandbox.scanFiles(handle);
        return handle;
    }, [sandbox]);

    const verifyAndReport=useCallback(async () => {
        const shape=await sandbox.verifyImageShapes();
        return shape;
    }, [sandbox]);

    return {
        ...sandbox,
        linkAndScan,
        verifyAndReport,
    };
}
