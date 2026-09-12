import { deflateSync } from 'node:zlib';
import { mkdirSync,writeFileSync } from 'node:fs';
function crc(buffer){let value=0xffffffff;for(const byte of buffer){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type);const size=Buffer.alloc(4);size.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([size,name,data,checksum]);}
const size=256;const pixels=Buffer.alloc(size*(1+size*4));
for(let y=0;y<size;y++){for(let x=0;x<size;x++){const offset=y*(size*4+1)+1+x*4;const left=Math.hypot(x-77,y-132),right=Math.hypot(x-179,y-132);const glasses=(left>33&&left<45)||(right>33&&right<45)||(x>117&&x<140&&y>121&&y<132)||(x>21&&x<36&&y>110&&y<122)||(x>220&&x<237&&y>110&&y<122);const color=glasses?[143,226,219]:[20,53,69];pixels[offset]=color[0];pixels[offset+1]=color[1];pixels[offset+2]=color[2];pixels[offset+3]=255;}}
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
mkdirSync('assets',{recursive:true});writeFileSync('assets/icon.png',png);writeFileSync('assets/icon.ico',Buffer.concat([ico,png]));
