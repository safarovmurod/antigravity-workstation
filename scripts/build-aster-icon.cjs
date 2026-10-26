'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
function crc32(bytes){let c=0xffffffff;for(const n of bytes){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,bytes){const tag=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(bytes.length);tail.writeUInt32BE(crc32(Buffer.concat([tag,bytes])));return Buffer.concat([head,tag,bytes,tail]);}
function inside(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function build(){
  const star=[[128,40],[150,98],[210,110],[164,151],[174,211],[128,181],[82,211],[92,151],[46,110],[106,98]],cut=[[128,88],[144,130],[128,169],[112,130]];
  const data=Buffer.alloc(256*(1+256*4));
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const p=y*1025+1+x*4,corner=Math.hypot(Math.max(62-x,0,x-194),Math.max(62-y,0,y-194)),bg=x>=8&&x<248&&y>=8&&y<248&&corner<=54;
    let color=[23,40,50,bg?255:0];
    if(inside(x+.5,y+.5,star)&&!inside(x+.5,y+.5,cut)){const t=(x+y)/512;color=[Math.round(146+19*t),Math.round(229-73*t),Math.round(214+15*t),255];}
    data.set(color,p);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(256);header.writeUInt32BE(256,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
}
if(require.main===module)fs.writeFileSync(path.resolve(__dirname,'../extensions/aster-appearance/icon.png'),build());
module.exports={build};
