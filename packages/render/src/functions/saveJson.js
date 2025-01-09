const link = document.createElement( 'a' );
link.style.display = 'none';
document.body.appendChild( link ); // Firefox workaround, see #6594


function saveString( text, filename ) {

    save( new Blob( [ text ], { type: 'text/plain' } ), filename );

}

function save( blob, filename ) {

    link.href = URL.createObjectURL( blob );
    link.download = filename;
    link.click();

    // URL.revokeObjectURL( url ); breaks Firefox...

}


function saveArrayBuffer( buffer, filename ) {

    save( new Blob( [ buffer ], { type: 'application/octet-stream' } ), filename );

}

// function for saving gltf
function saveJson( result ) {
    if ( result instanceof ArrayBuffer ) {

        saveArrayBuffer( result, 'robot.glb' );

    } else {

        const output = JSON.stringify( result, null, 2 );
        console.log( output );
        saveString( output, 'robot.gltf' );

    }
}

export { saveJson };