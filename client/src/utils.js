import { useState, useEffect } from 'react';
import { useMediaQuery } from 'react-responsive'

export const dvh = CSS.supports('height','100dvh') ? 'dvh' : 'vh';

export function capitalizeFirstLetter(string) {
  if (string && typeof string === "string") {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  return string || "";
}

export function toTitleCase(string){
  return string
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function filename(string) {
  return string.toLowerCase().replace(/ /g,"_");
}

//Same breakpoint everywhere
export function useMobile(){
  return useMediaQuery({ query: '(max-height: 600px)' });
}

export function useMobileXs(){
  return useMediaQuery({ query: '(max-height: 370px)' });
}

export function usePortrait(){
  return useMediaQuery({ query: "(orientation: portrait) and (max-width: 600px)" });
}

export function useDocumentVisibility() {
  const [isDocumentVisible, setIsDocumentVisible] = useState(!document.hidden);

  const handleVisibilityChange = () => {
    setIsDocumentVisible(!document.hidden);
  };

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isDocumentVisible;
}