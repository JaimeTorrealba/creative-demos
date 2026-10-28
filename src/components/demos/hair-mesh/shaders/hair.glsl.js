// Hair vertex/fragment shaders, ported from the original demo's shaders.js.
// Changes for Three.js RawShaderMaterial (glslVersion GLSL3):
//  - no "#version 300 es" line (Three prepends it)
//  - the "pos" attribute is renamed "position" so Three can determine the draw count

import { randChunk, hairShadingChunk } from './chunks.js';

const vsHairPre = /* glsl */ `
	precision highp float;

	in vec4 position;
	in vec4 pos2;
	in vec3 texW;

	uniform highp sampler3D tex_hairmesh;
	uniform highp sampler2D tex_uv;
	uniform highp sampler3D tex_uw;
	uniform highp sampler3D tex_v;
	uniform highp sampler3D tex_noise;
	uniform highp sampler2D tex_clump;

	uniform mat4 mvp;
	uniform mat4 mv;
	uniform mat3 mLight;
	uniform vec2 st;

	uniform float lengthVar;

	uniform float clumpSize;
	uniform float clumpExp;
	uniform float clumpVar;
	uniform float clumpPercent;
	uniform float clumpNoise;
	uniform float clumpFreq;

	uniform float curlAmount;
	uniform float curlFreq;
	uniform float curlTwists;
	uniform float curlTwistExp;
	uniform float curlExp;

	uniform float frizzAmount;
	uniform float frizzFreq;
	uniform float frizzExp;

	uniform float kinkAmount;
	uniform float kinkFreqUV;
	uniform float kinkFreqW;
	uniform float kinkWScale;
	uniform float kinkExp;

	uniform float fuzzAmount;
	uniform float fuzzDistrib;
	uniform float fuzzExp;

	out vec4 pView;
	out vec3 tView;
	out vec3 pLight;
	out float wPos;
	out float wMax;
	flat out int instanceID;
	out vec3 debugColor;

	` + randChunk + /* glsl */ `

	#define PI 3.1415926535897932384626433832795f

	vec3 GetPosFromHairMesh( vec2 stp, vec3 pos )
	{
		vec3 p0 = texture( tex_hairmesh, vec3(stp, pos.x) ).rgb;
		vec3 p1 = texture( tex_hairmesh, vec3(stp, pos.y) ).rgb;
		return mix( p0, p1, pos.z );
	}

	vec3 Noise( vec3 tc )
	{
		return texture(tex_noise, tc).rgb * 2.0 - 1.0;
	}

	float EvalHairVert( out vec3 p, out vec3 p2, vec4 pos, vec4 pos2, vec2 texW )
	{
		ivec3 size = textureSize( tex_hairmesh, 0 );
		vec2 stp = ( st + vec2( Rand(gl_InstanceID,0), Rand(gl_InstanceID,1) ) ) / vec2(size.xy);

		vec2 uv   = texture( tex_uv, stp ).rg;
		vec4 uw   = texture( tex_uw, vec3(stp,texW.x) );
		vec3 vDir = texture( tex_v,  vec3(stp,texW.x) ).rgb;
		vec3 uDir = uw.xyz;
		vec3 wDir = normalize( cross(uDir, vDir) );
		mat3 style2obj;
		style2obj[0] = normalize(vDir);
		style2obj[1] = normalize(uDir);
		style2obj[2] = normalize(wDir);

		float w  = uw.w;
		float w2 = uw.w + pos2.w;

		p  = GetPosFromHairMesh( stp, pos.xyz  );
		p2 = GetPosFromHairMesh( stp, pos2.xyz );

		// Clump
		vec2 cuv = uv;
		if ( Rand(gl_InstanceID,2) < clumpPercent ) {
			ivec2 ctsize = textureSize( tex_clump, 0 );
			vec2 duv = clumpNoise * Noise( vec3(uv*clumpFreq,0.0) ).xy / vec2(ctsize);
			vec4 clumpPP = texture( tex_clump, uv + duv );
			vec2 stc = clumpPP.xy + clumpPP.zw / 256.0;
			float cDist = length(stc - stp);
			vec3 cp  = GetPosFromHairMesh( stc, pos.xyz  );
			vec3 cp2 = GetPosFromHairMesh( stc, pos2.xyz );
			vec3 cDiff  = cp  - p;
			vec3 cDiff2 = cp2 - p2;
			p  += cDiff * (1.0f - cDist * clumpSize / length(cDiff )) * pow( w,  clumpExp );
			p2 += cDiff * (1.0f - cDist * clumpSize / length(cDiff2)) * pow( w2, clumpExp );
			cuv = texture( tex_uv, stc ).rg;
			uv = mix( cuv, uv, clumpVar );
		}

		// Kink
		vec3 dStyle  = Noise( vec3(uv*kinkFreqUV, w *kinkFreqW) );
		vec3 dStyle2 = Noise( vec3(uv*kinkFreqUV, w2*kinkFreqW) );
		dStyle  *= kinkAmount * pow( w,  kinkExp );
		dStyle2 *= kinkAmount * pow( w2, kinkExp );
		dStyle.z  *= kinkWScale;
		dStyle2.z *= kinkWScale;

		// Curl
		float curlNoise = Noise( vec3(cuv*curlFreq,0.0) ).z;
		float curlAngle  = curlTwists * ( pow( w,  curlTwistExp ) + curlNoise );
		float curlAngle2 = curlTwists * ( pow( w2, curlTwistExp ) + curlNoise );
		dStyle.xy  += vec2( cos(curlAngle), sin(curlAngle) ) * curlAmount * pow( w,  curlExp );
		dStyle2.xy += vec2( cos(curlAngle), sin(curlAngle) ) * curlAmount * pow( w2, curlExp );

		// Frizz
		vec2 frizz = Noise( vec3(uv*frizzFreq,0.0) ).rg;
		dStyle.xy  += frizz * ( frizzAmount * pow( w,  frizzExp ) );
		dStyle2.xy += frizz * ( frizzAmount * pow( w2, frizzExp ) );

		// Fuzz
		float phi = (2.0*PI) * Rand(gl_InstanceID,3);
		float s = fuzzAmount * pow( Rand(gl_InstanceID,4), fuzzDistrib );
		vec2 fuzz = vec2(cos(phi), sin(phi)) * s;
		dStyle.xy  += fuzz * pow( w,  fuzzExp );
		dStyle2.xy += fuzz * pow( w2, fuzzExp );

		p  += style2obj*dStyle;
		p2 += style2obj*dStyle2;

		return w;
	}

	void main()
	{
		vec3 p, p2;
		float w = EvalHairVert( p, p2, position, pos2, texW.xy );

		vec3 t  = (p2-p)*pos2.w;
		vec4 glpos = mvp * vec4(p,1);
		pView  =  mv * vec4(p,1);
		tView  = (mv * vec4(t,0)).xyz;
		pLight = mLight * p;
		wPos = w;
		wMax = 1.0 - lengthVar * Rand(gl_InstanceID,5);
		instanceID = gl_InstanceID;
		debugColor = vec3(w,w,w);
`;

const vsHairPost = /* glsl */ `
		gl_Position = glpos;
	}
`;

export const vsHairLine = vsHairPre + vsHairPost;

export const vsHairTri = vsHairPre + /* glsl */ `
		vec2 b = normalize( vec2( -tView.y, tView.x ) );
		glpos.xy += b * texW.z * glpos.w;
	` + vsHairPost;

export const fsHair = /* glsl */ `
	precision highp float;

	uniform vec3 lightDir;

	in vec4 pView;
	in vec3 tView;
	in vec3 pLight;
	in float wPos;
	in float wMax;
	flat in int instanceID;
	in vec3 debugColor;

	out vec4 theColor;

	` + hairShadingChunk + /* glsl */ `

	void main()
	{
		if ( wPos > wMax ) discard;
		vec3 v = normalize( -pView.xyz / pView.w );
		vec3 t = normalize(tView);
		vec3 pShad = pLight * 0.5 + 0.5;
		vec3 color = ShadeHair( pLight, t, v, instanceID );
		theColor = vec4(color,1);
	}
`;

export const fsHairShadow = /* glsl */ `
	precision lowp float;
	in float wPos;
	in float wMax;
	out vec4 theColor;
	void main()
	{
		if ( wPos > wMax ) discard;
		theColor = vec4(1,1,1,1);
	}
`;
