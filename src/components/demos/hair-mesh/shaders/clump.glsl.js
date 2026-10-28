// Clump-texture generation shaders, ported from the original demo's shaders.js.
// "pos" attribute renamed "position" for Three.js.

export const vsClump = /* glsl */ `
	in vec2 position;
	uniform highp sampler2D tex_uv;
	uniform highp sampler3D tex_noise;
	uniform vec2 st;
	uniform float clumpFreq;
	uniform float noiseScale;
	out vec2 stp;
	void main()
	{
		ivec2 size = textureSize( tex_uv, 0 );
		stp = ( st + position ) / vec2(size);
		vec2 uv = texture( tex_uv, stp ).rg;
		vec2 d  = texture( tex_noise, vec3(uv*clumpFreq,0.0) ).rg * 2.0 - 1.0;
		uv += d * noiseScale;
		gl_Position = vec4( uv*2.0 - 1.0, 0.0, 1.0 );
	}
`;

export const fsClump = /* glsl */ `
	precision highp float;
	in  vec2 stp;
	out vec4 theColor;
	void main()
	{
		// encode stp as (s0*256 + s1)/256
		vec2 s0 = floor(stp*256.0) / 256.0;
		vec2 s1 = stp*256.0 - floor(stp*256.0);
		theColor = vec4(s0,s1);
	}
`;

export const vsTex = /* glsl */ `
	in vec2 position;
	out vec2 uv;
	void main()
	{
		uv = position;
		gl_Position = vec4( position*2.0 - 1.0, 0.0, 1.0 );
	}
`;

export const fsClumpExt = /* glsl */ `
	precision highp float;
	uniform highp sampler2D tex_clump;
	in  vec2 uv;
	out vec4 theColor;
	void main()
	{
		ivec2 size = textureSize( tex_clump, 0 );
		vec2 d = 1.0 / vec2(size);

		theColor = texture( tex_clump, uv );                             if ( theColor != vec4(0,0,0,0) ) return;
		theColor = texture( tex_clump, vec2( uv.x - d.x, uv.y ) );       if ( theColor != vec4(0,0,0,0) ) return;
		theColor = texture( tex_clump, vec2( uv.x + d.x, uv.y ) );       if ( theColor != vec4(0,0,0,0) ) return;
		theColor = texture( tex_clump, vec2( uv.x, uv.y - d.y ) );       if ( theColor != vec4(0,0,0,0) ) return;
		theColor = texture( tex_clump, vec2( uv.x, uv.y + d.y ) );       if ( theColor != vec4(0,0,0,0) ) return;
		theColor = texture( tex_clump, vec2( uv.x - d.x, uv.y - d.y ) ); if ( theColor != vec4(0,0,0,0) ) return;
		theColor = texture( tex_clump, vec2( uv.x + d.x, uv.y - d.y ) ); if ( theColor != vec4(0,0,0,0) ) return;
		theColor = texture( tex_clump, vec2( uv.x - d.x, uv.y + d.y ) ); if ( theColor != vec4(0,0,0,0) ) return;
		theColor = texture( tex_clump, vec2( uv.x + d.x, uv.y + d.y ) );
	}
`;
