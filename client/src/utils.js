import { useMediaQuery } from 'react-responsive'

export const canPlayWebMTransparency = document.createElement("video").canPlayType('video/webm; codecs="vp9"') !== "";

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
