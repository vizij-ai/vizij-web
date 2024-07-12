

function replacer(key: string, value: any) {
    if(value instanceof Map) {
      return {
        dataType: 'Map',
        value: Array.from(value.entries()), // or with spread: value: [...value]
      };
    } else {
      return value;
    }
}

function reviver(key: string, value: any) {
    if(typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
        return new Map(value.value);
        }
    }
    return value;
}

export function stringifyMapped(value: any): string{
    return JSON.stringify(value, replacer, 2);
}

export function parseToMapped(json: string): any {
    return JSON.parse(json, reviver);
}