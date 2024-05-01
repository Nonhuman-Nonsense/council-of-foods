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
