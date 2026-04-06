import { createContext, useContext, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

const SandboxContext=createContext(null);

export function SandboxProvider({ children }) {
    const [directoryHandle, setDirectoryHandle]=useState(null);
    const [folderName, setFolderName]=useState('');
    const [files, setFiles]=useState([]);        // { name, size, type }
    const [scanning, setScanning]=useState(false);
    const [dataShape, setDataShape]=useState(null);      // detected shape e.g. [3,224,224]
    const [shapeError, setShapeError]=useState('');
    const [linkedAt, setLinkedAt]=useState(null);

    const linkFolder=useCallback(async () => {
        if (!('showDirectoryPicker' in window)) {
            toast.error('File System Access API not supported in this browser. Use Chrome/Edge.');
            return;
        }
        try {
            const handle=await window.showDirectoryPicker({ mode: 'read' });
            setDirectoryHandle(handle);
            setFolderName(handle.name);
            setFiles([]);
            setDataShape(null);
            setShapeError('');
            toast.success(`Folder linked: ${handle.name}`);
            return handle;
        } catch (err) {
            if (err.name!=='AbortError') {
                toast.error('Could not link folder.');
            }
            return null;
        }
    }, []);

    const scanFiles=useCallback(async (handle) => {
        const h=handle || directoryHandle;
        if (!h) return;
        setScanning(true);
        const found=[];
        try {
            await _walkDir(h, found);
            setFiles(found);
            toast.success(`Found ${found.length} file(s) in local folder.`);
        } catch (err) {
            toast.error('Error scanning folder.');
        } finally {
            setScanning(false);
        }
        return found;
    }, [directoryHandle]);

    const verifyImageShapes=useCallback(async () => {
        const imageFiles=files.filter((f) =>
            /\.(jpg|jpeg|png|webp|bmp)$/i.test(f.name)
        );
        if (imageFiles.length=== 0) {
            setShapeError('No image files found in folder.');
            return null;
        }

        const shapes=[];
        for (const fileInfo of imageFiles.slice(0, 10)) {
            try {
                const file=await fileInfo._fileHandle.getFile();
                const bitmap=await createImageBitmap(file);
                shapes.push([3, bitmap.height, bitmap.width]); // CHW format
                bitmap.close();
            } catch {
            }
        }

        if (shapes.length=== 0) {
            setShapeError('Could not read any images.');
            return null;
        }

        const ref=shapes[0];
        const allMatch=shapes.every(
            (s) => s[1]=== ref[1] && s[2]=== ref[2]
        );

        if (!allMatch) {
            setShapeError('Mixed image dimensions detected in folder.');
            setDataShape(null);
            return null;
        }

        setDataShape(ref);
        setShapeError('');
        toast.success(`Shape verified: [${ref.join(', ')}]`);
        return ref;
    }, [files]);

    const reset=useCallback(() => {
        setDirectoryHandle(null);
        setFolderName('');
        setFiles([]);
        setDataShape(null);
        setShapeError('');
        setLinkedAt(null);
    }, []);

    const totalBytes=files.reduce((acc, f) => acc + f.size, 0);

    return (
        <SandboxContext.Provider
            value={{
                directoryHandle, folderName, files, scanning,
                dataShape, shapeError, linkedAt, totalBytes,
                linkFolder, scanFiles, verifyImageShapes, reset,
                setLinkedAt,
            }}
        >
            {children}
        </SandboxContext.Provider>
    );
}

async function _walkDir(dirHandle, acc) {
    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind=== 'file') {
            const file=await handle.getFile();
            acc.push({ name, size: file.size, type: file.type, _fileHandle: handle });
        } else if (handle.kind=== 'directory') {
            await _walkDir(handle, acc);
        }
    }
}

export const useSandbox=() => {
    const ctx=useContext(SandboxContext);
    if (!ctx) throw new Error('useSandbox must be used within SandboxProvider');
    return ctx;
};
