// Hair-mesh wireframe overlay and light-direction indicator shaders,
// ported from the original demo's shaders.js. "pos" renamed "position".

export const vsHairmeshC = /* glsl */ `
	in vec4 position;
	uniform mat4 mvp;
	uniform highp sampler3D tex_hairmesh;
	void main()
	{
		ivec3 size = textureSize( tex_hairmesh, 0 );
		int ix = gl_InstanceID % size.x;
		int iy = gl_InstanceID / size.x;
		vec2 uvp = vec2( (float(ix)+0.5)/float(size.x), (float(iy)+0.5)/float(size.y) );
		vec3 p0 = texture( tex_hairmesh, vec3(uvp, position.x) ).rgb;
		vec3 p1 = texture( tex_hairmesh, vec3(uvp, position.y) ).rgb;
		vec3 p = mix( p0, p1, position.z );
		gl_Position = mvp * vec4(p,1);
	}
`;

export const vsHairmeshL = /* glsl */ `
	in vec2 position;
	uniform mat4 mvp;
	uniform highp sampler3D tex_hairmesh;
	void main()
	{
		ivec3 size = textureSize( tex_hairmesh, 0 );
		float z = (float(gl_InstanceID*3) + 0.5) / float(size.z);
		vec3 p = texture( tex_hairmesh, vec3(position,z) ).rgb;
		gl_Position = mvp * vec4(p,1);
	}
`;

export const fsHairmesh = /* glsl */ `
	precision lowp float;
	out vec4 theColor;
	void main()
	{
		theColor = vec4(0,1,1,1);
	}
`;

export const vsLight = /* glsl */ `
	in vec3 position;

	uniform mat4 mvp;
	uniform mat3 mLight;
	out float vis;

	void main()
	{
		mat3 light2Obj = inverse(mLight);
		vec3 p = light2Obj * position;
		gl_Position = mvp * vec4(p,1);
		vis = abs(position.z);
	}
`;

export const fsLight = /* glsl */ `
	precision lowp float;
	in float vis;
	out vec4 theColor;
	void main()
	{
		theColor = vec4(1,1,1,vis);
	}
`;
