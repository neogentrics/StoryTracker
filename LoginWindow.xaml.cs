using Newtonsoft.Json;
using Npgsql;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using System.Windows.Controls;

namespace StoryTracker
{
    public partial class LoginWindow : Window
    {
        private List<ConnectionInfo> _connections = new List<ConnectionInfo>();
        private readonly string _configFile = "connections.json";

        public LoginWindow()
        {
            InitializeComponent();
            LoadConnections();
        }

        private void ConnectButton_Click(object sender, RoutedEventArgs e)
        {
            // If the "Save" checkbox is checked, save the connection details.
            if (SaveCheckBox.IsChecked == true)
            {
                var connInfo = new ConnectionInfo
                {
                    Name = $"{UserTextBox.Text}@{HostTextBox.Text}",
                    Host = HostTextBox.Text,
                    Database = DatabaseTextBox.Text,
                    User = UserTextBox.Text
                };
                _connections.RemoveAll(c => c.Name == connInfo.Name);
                _connections.Add(connInfo);
                SaveConnections();
                LoadConnections(); // Refresh the list
                SavedConnectionsComboBox.SelectedItem = connInfo;
            }

            // Build the connection string from the text fields.
            var connectionString = $"Host={HostTextBox.Text};Database={DatabaseTextBox.Text};Username={UserTextBox.Text};Password={PasswordBox.Password}";

            LoginStatusTextBlock.Text = "Attempting to connect...";

            try
            {
                // Attempt to connect to the database.
                using var connection = new NpgsqlConnection(connectionString);
                connection.Open();

                // If successful, open the main window and close this one.
                var mainWindow = new MainWindow(connectionString);
                mainWindow.Show();
                this.Close();
            }
            catch (Exception ex)
            {
                // If it fails, update the status and show an error message.
                LoginStatusTextBlock.Text = "Connection failed.";
                MessageBox.Show($"Failed to connect: {ex.Message}", "Connection Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }


        private void DeleteButton_Click(object sender, RoutedEventArgs e)
        {
            if (SavedConnectionsComboBox.SelectedItem is ConnectionInfo selected)
            {
                _connections.Remove(selected);
                SaveConnections();
                LoadConnections(); // Refresh the list
            }
        }

        private void SavedConnectionsComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (SavedConnectionsComboBox.SelectedItem is ConnectionInfo selected)
            {
                HostTextBox.Text = selected.Host;
                DatabaseTextBox.Text = selected.Database;
                UserTextBox.Text = selected.User;
                PasswordBox.Clear();
            }
        }

        private void LoadConnections()
        {
            try
            {
                if (File.Exists(_configFile))
                {
                    string encryptedJson = File.ReadAllText(_configFile);
                    string json = DecryptString(encryptedJson);
                    _connections = JsonConvert.DeserializeObject<List<ConnectionInfo>>(json) ?? new List<ConnectionInfo>();
                }
                else
                {
                    _connections = new List<ConnectionInfo>();
                }
            }
            catch { _connections = new List<ConnectionInfo>(); } // If anything fails, start fresh

            SavedConnectionsComboBox.ItemsSource = _connections;
            SavedConnectionsComboBox.DisplayMemberPath = "Name";
        }

        private void SaveConnections()
        {
            string json = JsonConvert.SerializeObject(_connections, Formatting.Indented);
            string encryptedJson = EncryptString(json);
            File.WriteAllText(_configFile, encryptedJson);
        }

        // --- Encryption Helper Methods ---
        private string EncryptString(string plainText)
        {
            byte[] plainTextBytes = Encoding.UTF8.GetBytes(plainText);
            byte[] encryptedBytes = ProtectedData.Protect(plainTextBytes, null, DataProtectionScope.CurrentUser);
            return Convert.ToBase64String(encryptedBytes);
        }

        private string DecryptString(string encryptedText)
        {
            byte[] encryptedBytes = Convert.FromBase64String(encryptedText);
            byte[] plainTextBytes = ProtectedData.Unprotect(encryptedBytes, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plainTextBytes);
        }
    }

    public class ConnectionInfo
    {
        public string Name { get; set; } = string.Empty;
        public string Host { get; set; } = string.Empty;
        public string Database { get; set; } = string.Empty;
        public string User { get; set; } = string.Empty;
    }
}