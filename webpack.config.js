const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    mode: isDev ? 'development' : 'production',
    devtool: isDev ? 'cheap-source-map' : false,

    // Three separate bundles — each runs in a different Chrome context
    entry: {
      popup: './src/popup/index.jsx',
      background: './src/background/index.js',
      content: './src/content/index.js',
    },

    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true, // Wipe dist/ before each build
    },

    // CRITICAL for Chrome extensions: never split bundles into shared chunks.
    // Each output file must be fully self-contained.
    optimization: {
      splitChunks: false,
      runtimeChunk: false,
    },

    module: {
      rules: [
        // Transpile JSX and modern JS via Babel
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
        // Extract CSS into separate files (popup.css etc.)
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },

    resolve: {
      extensions: ['.js', '.jsx'],
    },

    plugins: [
      // Generate popup.html and automatically inject popup.js + popup.css
      new HtmlWebpackPlugin({
        template: './src/popup/index.html',
        filename: 'popup.html',
        chunks: ['popup'],
      }),

      // Copy manifest.json as-is into dist/
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: '.' },
        ],
      }),

      // Extract CSS to [name].css files instead of inlining in JS
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),
    ],
  };
};
