import { useMounted } from "./use-mounted";

export const useOrigin=()=>{
    const mounted = useMounted();
    return mounted ? window.location.origin : "";
}
